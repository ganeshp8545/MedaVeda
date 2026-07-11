import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from "react-native";

import EmptyState from "../../components/EmptyState";

import { COLORS } from "../../theme/colors";
import { FONT } from "../../theme/fonts";
import { SPACING } from "../../theme/spacing";
import { RADIUS } from "../../theme/radius";

import { useRoute, useNavigation } from "@react-navigation/native";

import OptionCard from "../../components/OptionCard";
import ProgressBar from "../../components/ProgressBar";
import UnlockOptionsPanel from "../../components/UnlockOptionsPanel";

import { auth, db } from "../../config/firebase";
import { QuizTest } from "../../services/quizService";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";

const QUESTION_TIME_SECONDS = 30;

// Plays a single Test's questions (20 MCQs). Access has already been
// decided one screen back (TestListScreen), which only lets you navigate
// here for a Test you're actually allowed to play - either the free
// preview Test, or any Test in an unlocked chapter.
export default function QuizScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();

  const {
    chapterId,
    chapterTitle,
    subjectId,
    yearId,
    test,
    hasMoreLockedTests,
  } = route.params ?? {};

  const questions = (test as QuizTest | undefined)?.questions ?? [];

  const [currentQuestion, setCurrentQuestion] = useState(0);

  // One entry per question - null means "not answered yet". Kept as an
  // array (rather than a single "selectedAnswer" value) so Previous/Next
  // can move freely between questions while still remembering what was
  // picked on each one.
  const [answers, setAnswers] = useState<(number | null)[]>(
    Array(questions.length).fill(null)
  );

  // The furthest question index the user has reached "live" (i.e. with
  // the countdown actually running on it). Going back with Previous does
  // not move this - it's what lets the timer stay paused while reviewing
  // an earlier question instead of restarting it.
  const [maxReached, setMaxReached] = useState(0);

  const [finished, setFinished] = useState(false);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS);

  if (!test || questions.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{chapterTitle ?? "Quiz"}</Text>
        <EmptyState title="This test couldn't be opened. Please go back and try again." />
        <TouchableOpacity
          activeOpacity={0.8}
          style={styles.button}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const score = answers.reduce((total: number, answer, index) => {
    if (answer === null) return total;
    const q = questions[index];
    return q && q.options[answer] === q.answer ? total + 1 : total;
  }, 0);

  const saveScore = async () => {
    try {
      await addDoc(collection(db, "quizScores"), {
        userId: auth.currentUser?.uid,
        email: auth.currentUser?.email,
        chapterId,
        chapterTitle,
        testId: test.id,
        testTitle: test.title,
        score,
        total: questions.length,
        percentage: Math.round((score / questions.length) * 100),
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.log(error);
    }
  };

  const handleSubmit = () => {
    saveScore();
    setFinished(true);
  };

  const goToQuestion = (index: number) => {
    setCurrentQuestion(index);
    setMaxReached((prev) => Math.max(prev, index));
    if (answers[index] === null) {
      setTimeLeft(QUESTION_TIME_SECONDS);
    }
  };

  const handleNext = () => {
    if (currentQuestion + 1 < questions.length) {
      goToQuestion(currentQuestion + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const handleAnswer = (index: number) => {
    if (answers[currentQuestion] !== null && answers[currentQuestion] !== undefined) {
      return;
    }

    const updated = [...answers];
    updated[currentQuestion] = index;
    setAnswers(updated);
  };

  const selectedAnswer =
    answers[currentQuestion] === undefined ? null : answers[currentQuestion];

  // The timer only ever runs "live" on the furthest unanswered question -
  // reviewing an earlier one with Previous is untimed.
  const isTimerActive =
    currentQuestion === maxReached && selectedAnswer === null;

  useEffect(() => {
    if (finished || !isTimerActive) {
      return;
    }

    if (timeLeft === 0) {
      handleNext();
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, finished, isTimerActive]);

  const question = questions[currentQuestion];
  const percentage = Math.round((score / questions.length) * 100);
  const passed = percentage >= 50;
  const isLastQuestion = currentQuestion === questions.length - 1;

  if (finished) {
    return (
      <View style={styles.center}>
        <View style={styles.resultCard}>
          <Text style={styles.resultEmoji}>{passed ? "🏆" : "📚"}</Text>

          <Text style={styles.finish}>
            {passed ? "Congratulations!" : "Better Luck Next Time"}
          </Text>

          <Text style={styles.score}>
            {score} / {questions.length}
          </Text>

          <Text style={styles.percentage}>{percentage}%</Text>

          <View
            style={[
              styles.statusBadge,
              { backgroundColor: passed ? COLORS.success : COLORS.error },
            ]}
          >
            <Text style={styles.statusText}>{passed ? "PASS" : "FAIL"}</Text>
          </View>

          {hasMoreLockedTests && (
            <>
              <View style={styles.lockedBanner}>
                <Text style={styles.lockedBannerText}>
                  🔒 More tests available - purchase this chapter to unlock
                  the full quiz.
                </Text>
              </View>

              <View style={{ width: "100%" }}>
                <UnlockOptionsPanel
                  chapterId={chapterId}
                  subjectId={subjectId}
                  yearId={yearId}
                />
              </View>
            </>
          )}

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.button}
            onPress={() => {
              setAnswers(Array(questions.length).fill(null));
              setCurrentQuestion(0);
              setMaxReached(0);
              setFinished(false);
              setTimeLeft(QUESTION_TIME_SECONDS);
            }}
          >
            <Text style={styles.buttonText}>Restart Test</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.secondaryButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.previousButtonText}>Back to Tests</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{chapterTitle}</Text>
      <Text style={styles.subtitle}>{test.title}</Text>

      <Text style={styles.progressTitle}>Quiz Progress</Text>

      <ProgressBar
        progress={((currentQuestion + 1) / questions.length) * 100}
      />

      <Text style={styles.counter}>
        {currentQuestion + 1} / {questions.length}
      </Text>

      <View style={styles.timerCard}>
        <Text style={styles.timerLabel}>Time Left</Text>
        <Text style={styles.timer}>
          {isTimerActive ? `⏱ ${timeLeft}s` : "—"}
        </Text>
      </View>

      <View style={styles.questionCard}>
        <Text style={styles.questionNumber}>
          Question {currentQuestion + 1}
        </Text>
        <Text style={styles.question}>{question.question}</Text>
      </View>

      {question.options.map((option: string, index: number) => (
        <OptionCard
          key={index}
          title={option}
          disabled={selectedAnswer !== null}
          onPress={() => handleAnswer(index)}
          isCorrect={
            selectedAnswer !== null && question.options[index] === question.answer
          }
          isWrong={
            selectedAnswer === index && question.options[index] !== question.answer
          }
        />
      ))}

      <View style={styles.navRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.navButton,
            styles.previousButton,
            currentQuestion === 0 && styles.navButtonDisabled,
          ]}
          onPress={handlePrevious}
          disabled={currentQuestion === 0}
        >
          <Text style={styles.previousButtonText}>Previous</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.navButton, styles.nextButton]}
          onPress={isLastQuestion ? handleSubmit : handleNext}
        >
          <Text style={styles.buttonText}>
            {isLastQuestion ? "Submit Test" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  progressTitle: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    fontWeight: "600",
    marginBottom: SPACING.sm,
  },
  lockedBanner: {
    marginTop: SPACING.md,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  lockedBannerText: {
    fontSize: FONT.small,
    color: COLORS.subtitle,
    textAlign: "center",
  },
  resultCard: {
    width: "100%",
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    alignItems: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  resultEmoji: { fontSize: 60, marginBottom: SPACING.md },
  statusBadge: {
    marginTop: SPACING.md,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 30,
  },
  statusText: { color: COLORS.white, fontSize: FONT.body, fontWeight: "700" },
  timerCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    alignItems: "center",
  },
  timerLabel: { fontSize: FONT.small, color: COLORS.subtitle },
  questionCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  questionNumber: {
    fontSize: FONT.small,
    color: COLORS.accent,
    fontWeight: "700",
    marginBottom: SPACING.sm,
  },
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACING.lg,
    backgroundColor: COLORS.background,
  },
  title: { fontSize: FONT.title, fontWeight: "bold", color: COLORS.text },
  subtitle: {
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginTop: 6,
    marginBottom: SPACING.lg,
  },
  counter: {
    textAlign: "center",
    fontSize: FONT.body,
    color: COLORS.subtitle,
    marginBottom: SPACING.md,
    fontWeight: "600",
  },
  timer: {
    fontSize: FONT.subHeading,
    fontWeight: "bold",
    color: COLORS.error,
    textAlign: "right",
    marginBottom: SPACING.sm,
  },
  question: {
    fontSize: FONT.subHeading,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  button: {
    marginTop: SPACING.lg,
    backgroundColor: COLORS.accent,
    padding: 16,
    borderRadius: RADIUS.md,
    alignItems: "center",
    width: "100%",
  },
  secondaryButton: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    borderRadius: RADIUS.md,
    alignItems: "center",
    width: "100%",
  },
  buttonText: { color: COLORS.white, fontSize: FONT.body, fontWeight: "700" },
  navRow: {
    flexDirection: "row",
    marginTop: SPACING.lg,
  },
  navButton: {
    flex: 1,
    padding: 16,
    borderRadius: RADIUS.md,
    alignItems: "center",
  },
  previousButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: SPACING.md,
  },
  previousButtonText: {
    color: COLORS.text,
    fontSize: FONT.body,
    fontWeight: "700",
  },
  nextButton: {
    backgroundColor: COLORS.accent,
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  finish: {
    fontSize: FONT.heading,
    color: COLORS.accentLight,
    fontWeight: "700",
    textAlign: "center",
  },
  score: {
    fontSize: 44,
    fontWeight: "700",
    color: COLORS.accentLight,
    marginVertical: SPACING.lg,
  },
  percentage: {
    fontSize: FONT.heading,
    fontWeight: "700",
    color: COLORS.success,
    marginBottom: SPACING.md,
  },
});
