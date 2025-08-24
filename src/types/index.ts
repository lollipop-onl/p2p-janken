export type Hand = "rock" | "paper" | "scissors" | null;
export type GameResult = "win" | "lose" | "draw" | null;

export interface GameState {
  myHand: Hand;
  opponentHand: Hand;
  result: GameResult;
  gameId: string;
}

export interface ConnectionData {
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidate[];
}
