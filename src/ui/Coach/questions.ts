// The questions the learner can ask, offered as buttons.
//
// A free text box is a trap for a beginner and a liability for the validator: a
// free-form question can be about anything, including a position the fact pack
// says nothing about, and the model will helpfully invent something. Fixed
// questions over a position the app has already computed keep the whole exchange
// inside the trust floor, and they are also the questions the app can afford to
// answer: the fact pack is tiered by the question, and a question with no
// matching tier simply gets the base.

export interface CoachQuestion {
  id: string;
  label: string;
  text: string;
}

export const FACT_QUESTIONS: ReadonlyArray<CoachQuestion> = [
  { id: 'hanging', label: 'Is any of my pieces in danger?', text: 'Is any of my pieces attacked with nothing defending it?' },
  { id: 'tactic', label: 'Is there a tactic here?', text: 'Is there a tactic in this position? If there is not one, say so.' },
  { id: 'development', label: 'What should I develop?', text: 'Which of my pieces are still undeveloped?' },
  { id: 'king', label: 'Is my king safe?', text: 'Is my king safe in this position?' },
  { id: 'material', label: 'Am I winning on material?', text: 'Am I ahead on material, and by how much?' },
];
