const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../node_modules/typescript');
// Deterministic Hook scheduler: enforces the same call count/order on every render.
// Native UI/animation rendering remains a device test.
function hooks() {
  const slots = []; let cursor = 0, previousCount; const effects = [];
  const useSlot = (kind, create) => {
    const i = cursor++; if (!slots[i]) slots[i] = { kind, ...create() };
    assert.equal(slots[i].kind, kind, 'Hook order changed'); return [slots[i], i];
  };
  const changed = (a,b) => !a || !b || a.length !== b.length || a.some((x,i) => !Object.is(x,b[i]));
  return {
    slots, effects,
    render(component, props) { cursor = 0; const result = component(props); if (previousCount !== undefined) assert.equal(cursor, previousCount, 'Hook count changed after offline load'); previousCount = cursor; return result; },
    api: {
      useState(initial) { const [slot] = useSlot('state', () => ({ value: typeof initial === 'function' ? initial() : initial })); return [slot.value, next => { slot.value = typeof next === 'function' ? next(slot.value) : next; }]; },
      useRef(initial) { const [slot] = useSlot('ref', () => ({ value: { current: initial } })); return slot.value; },
      useEffect(fn,deps) { const [slot] = useSlot('effect', () => ({})); if (changed(slot.deps,deps)) { effects.push(fn); slot.deps = deps; } },
      useCallback(fn,deps) { const [slot] = useSlot('callback', () => ({})); if (changed(slot.deps,deps)) { slot.deps=deps; slot.value=fn; } return slot.value; },
    },
  };
}
(async () => {
  let current = hooks(); const parent = current;
  const react = Object.fromEntries(['useState','useRef','useEffect','useCallback'].map(name => [name,(...args) => current.api[name](...args)]));
  const test = { id:'q', title:'Test', questionRevision:1, questions:[{ question:'Q1', options:['A','B'], answer:'A' },{ question:'Q2', options:['C','D'], answer:'D' }] };
  const component = () => null;
  const mocks = {
    react, 'react/jsx-runtime': { jsx:(type,props)=>({type,props}), jsxs:(type,props)=>({type,props}) },
    'react-native': { View:'View', Text:'Text', TouchableOpacity:'Button', ActivityIndicator:'Loading', StyleSheet:{create:x=>x} },
    '@react-navigation/native': { useRoute:()=>({params:{offlineFileUri:'file:///quiz.json',subjectId:'s',subjectTitle:'S'}}), useNavigation:()=>({goBack(){}}) },
    '../../services/authState':{getCurrentUser:()=>({id:'buyer'})}, '../../services/quizAttempts':{getLocalQuizAttempts:()=>[],recordQuizAttempt:()=> 'attempt'},
    '../../config/database':{OFFLINE_DB_SUPPORTED:true}, '../../utils/downloadManager':{loadOfflineQuiz:async()=>test}, '../../utils/logger':{logError(){}},
  };
  for (const [name,key] of [['colors','COLORS'],['fonts','FONT'],['spacing','SPACING'],['radius','RADIUS']]) mocks[`../../theme/${name}`]={[key]:new Proxy({}, {get:()=>1})};
  for (const name of ['EmptyState','OptionCard','ProgressBar','motion/SuccessBurst']) mocks[`../../components/${name}`]={__esModule:true,default:component};
  const source = fs.readFileSync(process.env.MEDVEDA_TEST_QUIZ_SOURCE || path.join(__dirname,'../src/screens/quiz/QuizScreen.tsx'),'utf8');
  const code = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const mod={exports:{}}; vm.runInNewContext(code,{module:mod,exports:mod.exports,require:id=>{assert.ok(id in mocks,id);return mocks[id];},setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}});
  parent.render(mod.exports.default); parent.effects.splice(0).forEach(fn=>fn());
  await new Promise(resolve=>setImmediate(resolve));
  const loaded = parent.render(mod.exports.default);
  assert.equal(loaded.props.test.id,'q');
  current=hooks(); current.render(loaded.type,loaded.props);
  assert.equal(current.slots[1].value.length,2); assert.ok(current.slots[1].value.every(v=>v===null));
  current.effects.splice(0).forEach(fn=>fn()); current.render(loaded.type,loaded.props);
  console.log('PASS offline quiz loading preserves Hook order and initializes every answer after content arrives');
})().catch(error=>{console.error(error);process.exitCode=1;});
