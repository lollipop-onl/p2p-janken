import { GameState, Hand } from "../types";
import { HAND_EMOJIS } from "../utils/constants";

interface GameBoardProps {
  gameState: GameState;
  isWaiting: boolean;
  isHost: boolean;
  onSelectHand: (hand: Hand) => void;
  onStartNewGame: () => void;
}

export const GameBoard = ({
  gameState,
  isWaiting,
  isHost,
  onSelectHand,
  onStartNewGame,
}: GameBoardProps) => {
  if (!gameState.myHand && !isWaiting) {
    return (
      <div>
        <p className="mb-4">手を選んでください：</p>
        <div className="flex justify-center space-x-4">
          {Object.entries(HAND_EMOJIS).map(([hand, emoji]) => (
            <button
              key={hand}
              onClick={() => onSelectHand(hand as Hand)}
              className="text-4xl p-3 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50"
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-center">
          <p className="text-sm text-gray-600">あなた</p>
          <div className="text-4xl">
            {gameState.myHand ? HAND_EMOJIS[gameState.myHand] : "❓"}
          </div>
        </div>
        <div className="text-2xl">VS</div>
        <div className="text-center">
          <p className="text-sm text-gray-600">相手</p>
          <div className="text-4xl">
            {gameState.opponentHand
              ? HAND_EMOJIS[gameState.opponentHand]
              : "❓"}
          </div>
        </div>
      </div>

      {isWaiting && (
        <p className="text-yellow-600">相手の選択を待っています...</p>
      )}

      {gameState.result && (
        <div className="space-y-4">
          <div
            className={`text-xl font-bold ${
              gameState.result === "win"
                ? "text-green-600"
                : gameState.result === "lose"
                ? "text-red-600"
                : "text-yellow-600"
            }`}
          >
            {gameState.result === "win"
              ? "🎉 勝利！"
              : gameState.result === "lose"
              ? "😢 敗北..."
              : "🤝 引き分け"}
          </div>
          {isHost ? (
            <button
              onClick={onStartNewGame}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              もう一度
            </button>
          ) : (
            <div className="text-gray-600 text-sm">
              ホストが次のゲームを開始するまでお待ちください...
            </div>
          )}
        </div>
      )}
    </div>
  );
};
