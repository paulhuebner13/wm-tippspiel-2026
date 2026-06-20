export type Stage =
  | 'group'
  | 'round_of_32'
  | 'round_of_16'
  | 'quarter_final'
  | 'semi_final'
  | 'third_place'
  | 'final';

export type Profile = {
  id: string;
  username: string;
  is_admin: boolean;
  can_submit_results?: boolean;
};

export type Team = {
  id: string;
  name: string;
  short_name: string;
  flag_path: string;
  group_name: string | null;
};

export type Match = {
  id: string;
  match_number: number;
  stage: Stage;
  group_name: string | null;
  kickoff_time: string;
  venue: string;
  home_team_id: string | null;
  away_team_id: string | null;
  home_placeholder: string | null;
  away_placeholder: string | null;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  provisional_home_score?: number | null;
  provisional_away_score?: number | null;
  provisional_winner_team_id?: string | null;
  provisional_updated_at?: string | null;
  is_finished: boolean;
  is_open_for_predictions: boolean;
  home_team?: Team | null;
  away_team?: Team | null;
};

export type Prediction = {
  id: string;
  user_id: string;
  match_id: string;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  advance_team_id: string | null;
  profile?: Profile | null;
};


export type PlayerGroup = {
  id: string;
  name: string;
  created_at: string;
  special_effect_active?: boolean;
};

export type GroupMember = {
  group_id: string;
  profile_id: string;
};
