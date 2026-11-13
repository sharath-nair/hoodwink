export interface Config {
  minPlayers: number;
  maxPlayers: number;
  totalRounds: number;
  submitMs: number;
  voteMs: number;
  revealMs: number;
  scoreboardMs: number;
  maxAnswerLength: number;
  maxNameLength: number;
  pointsForTruth: number;
  pointsPerFool: number;
}

export const DEFAULT_CONFIG: Config = {
  minPlayers: 3,
  maxPlayers: 8,
  totalRounds: 5,
  submitMs: 45_000,
  voteMs: 30_000,
  revealMs: 12_000,
  scoreboardMs: 8_000,
  maxAnswerLength: 60,
  maxNameLength: 20,
  pointsForTruth: 1000,
  pointsPerFool: 500,
};
