import { Hand, GameResult } from "../types";

export const determineWinner = (
  myHand: Hand,
  opponentHand: Hand
): GameResult => {
  if (!myHand || !opponentHand) return null;

  if (myHand === opponentHand) return "draw";

  const winConditions = {
    rock: "scissors",
    paper: "rock",
    scissors: "paper",
  };

  return winConditions[myHand] === opponentHand ? "win" : "lose";
};
