# MedVeda Google Play listing draft

Draft for owner review, 15 October 2026. Copy only after checking the shipped
build, course catalogue, screenshots, and final Play Console requirements. The
temporary ₹1 test tier must be removed before production. The current Play
build uses Google Play Billing only; alternative billing is not enabled.

## English

**Short description (66 characters, limit 80)**

> AYUSH study notes, free video lectures and MCQ practice in one app

**Full description (under 4,000 characters)**

> MedVeda brings study material for AYUSH degree students into one app. Browse
> available courses, years, subjects and chapters to find notes, video lectures
> and MCQ practice.
>
> Watch available video lectures and practise with MCQ tests for free. Review
> your quiz scores and continue studying with notes arranged by topic. Some PDF
> notes are paid packages; the app shows the package and price before purchase.
>
> Purchases of paid PDF notes in the Google Play version are processed through
> Google Play Billing. The app confirms purchases with Google Play before
> unlocking content.
>
> MedVeda is an independent educational app. Its content supports study and exam
> preparation; it is not medical advice, diagnosis or treatment.

## मराठी

**संक्षिप्त वर्णन (८० अक्षरांच्या मर्यादेत; प्रकाशनापूर्वी Console मध्ये तपासा)**

> आयुष अभ्यासासाठी नोट्स, मोफत व्हिडिओ आणि MCQ सराव

**पूर्ण वर्णन (४,००० अक्षरांच्या मर्यादेत)**

> MedVeda हे आयुष पदवीच्या विद्यार्थ्यांसाठी अभ्यास साहित्य असलेले अॅप आहे.
> उपलब्ध अभ्यासक्रम, वर्ष, विषय आणि प्रकरणांनुसार नोट्स, व्हिडिओ व्याख्याने
> आणि MCQ सराव पाहता येतो.
>
> उपलब्ध व्हिडिओ व्याख्याने पाहणे आणि MCQ चा सराव करणे मोफत आहे. तुम्ही
> तुमचे प्रश्नमंजुषेतील गुण पाहू शकता. काही PDF नोट्स सशुल्क पॅकेजमध्ये
> उपलब्ध आहेत. खरेदीपूर्वी पॅकेज आणि किंमत अॅपमध्ये दिसते.
>
> Google Play आवृत्तीमध्ये सशुल्क PDF नोट्सची खरेदी Google Play Billing द्वारे
> केली जाते. सामग्री अनलॉक करण्यापूर्वी अॅप Google Play कडून खरेदीची
> पडताळणी करते.
>
> MedVeda हे स्वतंत्र शैक्षणिक अॅप आहे. यातील साहित्य अभ्यास आणि परीक्षा
> तयारीसाठी आहे; ते वैद्यकीय सल्ला, निदान किंवा उपचार नाही.

## Screenshot shot list

Use only captures of the final production-like build and real available
content. Remove personal data, payment identifiers and test prices.

1. Home: course/year context and main study sections.
2. Subject or chapter list: show how content is organised.
3. Free video lecture: show actual playable content.
4. MCQ practice and score screen: show a completed real test.
5. PDF note detail: show the package scope and price clearly.
6. Google Play purchase flow, with no personal or transaction details.

## Content rating and App content worksheet — VERIFY in Play Console

These are source-based draft answers, not a completed rating questionnaire.
Use the Console's actual questions and inspect all live content before filing.

| Topic | Draft factual answer | Verification |
|---|---|---|
| Primary purpose | Educational study and exam preparation for degree-level AYUSH students. | VERIFY final catalogue and category. |
| Medical content | Educational material; app says it does not provide diagnosis, treatment or medical advice. | VERIFY every live lesson, note, video and quiz. |
| Violence, sexual content, gambling, drugs, offensive language | No such feature was found in the audited app flow. | VERIFY all live and user-visible content; answer each Console question separately. |
| User-generated content or user-to-user communication | No public posting, chat or social feed was found; referral codes can be shared outside the app. | VERIFY final build and content. |
| Ads | No ad SDK or ad placement found in audited source. | VERIFY final build and Console classification. |
| Purchases | Paid PDF note packages through Google Play Billing. | Verify against the final Play build. |
| Target audience | Degree-level students; policies say the service is not directed at children. | VERIFY intended age groups in Console with owner. |

## Public policy URLs for Console

- Privacy: `https://www.medveda.in/privacy-policy`
- Terms: `https://www.medveda.in/terms`
- Refunds: `https://www.medveda.in/refund-policy`
- Account deletion: `https://www.medveda.in/delete-account`

These paths come from `mobile-app/src/constants/legal.ts`, the website's
canonical URL builder, and `website/vercel.json`. VERIFY that the newly built
policy pages are deployed and reachable publicly before submitting the URLs.
