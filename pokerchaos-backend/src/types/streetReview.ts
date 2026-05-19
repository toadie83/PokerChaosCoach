export type ReviewConfidence = "low" | "medium" | "high";
export type PokerStreet = "preflop" | "flop" | "turn" | "river";

export interface LegacyHandReview {
  overall_score: number;
  preflop_score: number | null;
  flop_score: number | null;
  turn_score: number | null;
  river_score: number | null;
  confidence: ReviewConfidence;
  what_was_good: string;
  primary_leak: string;
  better_line: string;
  reasoning: string;
}

export interface StreetAction {
  action: string;
  sizing: string | null;
  size: string | null;
}

export interface StreetMetrics {
  pot_size_bb: number | null;
  spr: number | null;
  facing_size_bb: number | null;
  pot_odds: string | null;
}

export interface StreetAnalysis {
  insight: string;
  range_context: string;
  board_texture: string;
  sizing_commentary: string;
  plan_commentary: string;
  takeaway: string;
}

export interface StreetHandClassification {
  made_hand_category: string | null;
  made_hand_type?: string | null;
  effective_hand_category: string | null;
  hand_tier?: string | null;
  hand_label?: string | null;
  premium_holding?: boolean | null;
  pair_type: string | null;
  trips_type: string | null;
  showdown_strength: string | null;
  showdown_relevance: string | null;
  hero_contribution_level: string | null;
  board_made_hand: string | null;
  board_pair_kicker_class: string | null;
  kicker_strength: string | null;
  bluff_catcher: boolean;
}

export interface StreetReviewNode {
  street: PokerStreet;
  skipped?: boolean;
  skipped_reason?: string | null;
  summary?: string | null;
  score: number | null;
  action_taken: StreetAction;
  preferred_action: StreetAction;
  metrics: StreetMetrics;
  analysis: StreetAnalysis;
  strategic_tags: string[];
  tags: string[];
  confidence: ReviewConfidence;
  classification?: StreetHandClassification | null;
}

export interface HandSummaryNode {
  overall_score: number | null;
  confidence: ReviewConfidence;
  headline: string;
  biggest_leak: string;
  mistakes_found: number;
}

export interface StreetReviewAggregate {
  hand_summary: HandSummaryNode;
  street_reviews: StreetReviewNode[];
  tags: string[];
  key_mistakes: string[];
}
