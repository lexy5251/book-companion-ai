/**
 * Fixed evaluation questions for the ingested Meditations book.
 *
 * The set covers ordinary questions, highlighted passages, context-heavy
 * questions, and questions the book cannot answer. Answerable questions use
 * deterministic text anchors to identify gold chunks independently of
 * embedding retrieval; an answer passes retrieval when any matching chunk
 * lands in the top-k results.
 */

export const EXPECTED_BOOK_TITLE = "Meditations";

export type EvalMode = "FREEFORM" | "HIGHLIGHT";

type QuestionCore = {
  id: string;
  question: string;
  note?: string;
};

type FreeformQuestion = {
  mode: "FREEFORM";
  highlight?: undefined;
};

type HighlightQuestion = {
  mode: "HIGHLIGHT";
  highlight: string;
};

export type AnswerableEvalQuestion = QuestionCore &
  (FreeformQuestion | HighlightQuestion) & {
    expected: "answer";
    /** Text phrases used to resolve gold chunks after ingestion. */
    goldAnchors: readonly [string, ...string[]];
    /** Context-heavy question needing historical or terminological depth. */
    differentiator?: boolean;
  };

export type RefusalEvalQuestion = QuestionCore & {
  expected: "refusal";
  mode: "FREEFORM";
  highlight?: undefined;
  /**
   * Out-of-book questions have no gold passages and should be refused.
   */
  goldAnchors: readonly [];
  differentiator?: undefined;
};

export type EvalQuestion = AnswerableEvalQuestion | RefusalEvalQuestion;

/** Validate fixture invariants before making any model or database calls. */
export function validateQuestions(questions: readonly EvalQuestion[]): void {
  const ids = new Set<string>();

  for (const q of questions) {
    if (ids.has(q.id)) throw new Error(`Duplicate evaluation question id: ${q.id}`);
    ids.add(q.id);

    if (!q.question.trim()) throw new Error(`Question ${q.id} is empty`);

    if (q.mode === "HIGHLIGHT" && !q.highlight.trim()) {
      throw new Error(`Highlight question ${q.id} has an empty highlight`);
    }
    if (q.expected === "answer" && q.goldAnchors.length === 0) {
      throw new Error(`Answerable question ${q.id} needs at least one gold anchor`);
    }
    if (q.goldAnchors.some((anchor) => !anchor.trim())) {
      throw new Error(`Question ${q.id} has an empty gold anchor`);
    }
    if (q.expected === "refusal" && q.goldAnchors.length > 0) {
      throw new Error(`Refusal question ${q.id} must not define gold anchors`);
    }
  }
}

export const QUESTIONS = [
  // ---- Core questions ----
  {
    id: "morning-bed",
    question:
      "What does Marcus Aurelius say you should tell yourself in the morning when you don't feel like getting out of bed?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["go about a man's work"],
    note: "Book 5 opening — 'it is to go about a man's work that I am stirred up.'",
  },
  {
    id: "retreat-into-self",
    question:
      "Where does Marcus say is the best place to retreat for peace, rather than to the countryside, mountains, or seashore?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["retire into thyself"],
    note: "Book 4.III — 'retire into thyself'; the soul is the best retreat.",
  },
  {
    id: "opinion-vs-things",
    question:
      "According to Marcus, is the source of our disturbance the external things themselves, or our own opinions about them?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["reach not unto the soul", "from the opinion only which is within"],
    note: "Book 4 — 'things reach not unto the soul... from the opinion only within.'",
  },
  {
    id: "put-off",
    question:
      "What does Marcus tell himself about how long he has already put things off, and the limited time he has left?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["how long thou hast already put off these things"],
    note: "Book 2.I — 'Remember how long thou hast already put off these things.'",
  },
  {
    id: "death-and-gods",
    question:
      "How does Marcus reason about death and why it need not be feared, whether or not the gods exist?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["if there be any gods", "there be no gods"],
    note: "Book 2 — 'as for death, if there be any gods, it is no grievous thing.'",
  },
  {
    id: "apollonius",
    question: "What did Marcus Aurelius say he learned from Apollonius?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["true liberty", "unvariable steadfastness"],
    note: "Book 1 — 'true liberty, and unvariable steadfastness.'",
  },
  {
    id: "thank-the-gods",
    question: "What does Marcus thank the gods for having given him?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["good grandfathers"],
    note: "Book 1 — 'From the gods I received that I had good grandfathers...'",
  },
  {
    id: "fountain",
    question:
      "What image of a fountain does Marcus use to describe keeping your mind pure even when others insult or wrong you?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["fountain of sweet and clear water"],
    note: "Book 8 — the sweet fountain that cannot be dyed by dirt thrown in.",
  },
  {
    id: "best-for-everyone",
    question:
      "What does Marcus say is 'best for every one,' and where does he say it comes from?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["best for every one", "common nature of all"],
    note: "Book 10 — 'that which the common nature of all doth send unto every one.'",
  },
  {
    id: "every-act-as-last",
    question:
      "What does Marcus mean when he advises going about every action as if it were your last?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["every action as thy last action"],
    note: "Book 2 — 'go about every action as thy last action.'",
  },

  // ---- Highlighted passages ----
  {
    id: "hl-change-opinion",
    question: "What does this mean, in plain terms?",
    mode: "HIGHLIGHT",
    highlight: "This world is mere change, and this life, opinion.",
    expected: "answer",
    goldAnchors: ["world is mere change"],
    note: "Casaubon's rendering of the famous 'the universe is change, life is opinion.'",
  },
  {
    id: "hl-retiring-places",
    question: "What point is Marcus making here?",
    mode: "HIGHLIGHT",
    highlight:
      "They seek for themselves private retiring places, as country villages, the sea-shore, mountains; yea thou thyself art wont to long much after such places.",
    expected: "answer",
    goldAnchors: ["private retiring places"],
    note: "Book 4.III — the lead-in to 'retire into thyself.'",
  },

  // ---- Context-heavy questions ----
  {
    id: "diff-born",
    question:
      "When and where was Marcus Aurelius born, and what was his real name at birth?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["April 26", "M Annius Verus"],
    differentiator: true,
    note: "Editor's INTRODUCTION — born April 26, A.D. 121; M. Annius Verus.",
  },
  {
    id: "diff-stoic-virtue",
    question:
      "What is the core Stoic idea about virtue and happiness that underlies this book?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["virtue alone is happiness", "vice is unhappiness"],
    differentiator: true,
    note: "INTRODUCTION — 'Virtue alone is happiness, and vice is unhappiness.'",
  },
  {
    id: "diff-fronto",
    question:
      "Who was Cornelius Fronto, and what was his relationship to Marcus Aurelius?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["Cornelius Fronto"],
    differentiator: true,
    note: "Appendix — Fronto, Marcus's rhetoric teacher; their correspondence.",
  },
  {
    id: "diff-mistress-part",
    question:
      "What does Marcus mean by the 'rational' or 'mistress part' of a person?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["rational part", "mistress part"],
    differentiator: true,
    note: "Terminological — the ruling/governing faculty of the soul.",
  },
  {
    id: "diff-diognetus",
    question: "Who was Diognetus, and what did Marcus say he learned from him?",
    mode: "FREEFORM",
    expected: "answer",
    goldAnchors: ["Diognetus", "sorcerers or prestidigitators"],
    differentiator: true,
    note: "Book 1 — not to be taken in by wonder-workers, sorcerers, and impostors.",
  },

  // ---- Out-of-book questions ----
  {
    id: "no-bitcoin",
    question:
      "What does Marcus Aurelius say about Bitcoin and cryptocurrency investing?",
    mode: "FREEFORM",
    expected: "refusal",
    goldAnchors: [],
  },
  {
    id: "no-marathon",
    question:
      "What training plan does the book recommend for running a marathon race?",
    mode: "FREEFORM",
    expected: "refusal",
    goldAnchors: [],
  },
  {
    id: "no-email",
    question:
      "What does Marcus recommend for managing email overload and social-media distraction?",
    mode: "FREEFORM",
    expected: "refusal",
    goldAnchors: [],
  },
] satisfies readonly EvalQuestion[];
