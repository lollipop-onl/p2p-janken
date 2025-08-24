import { useState, useRef, useEffect } from "react";

type Hand = "rock" | "paper" | "scissors" | null;
type GameResult = "win" | "lose" | "draw" | null;

interface GameState {
  myHand: Hand;
  opponentHand: Hand;
  result: GameResult;
  gameId: string;
}

interface ConnectionData {
  sdp: RTCSessionDescriptionInit;
  candidates: RTCIceCandidate[];
}

const HAND_EMOJIS = {
  rock: "✊",
  paper: "✋",
  scissors: "✌️",
};

const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export const App = () => {
  const [connectionState, setConnectionState] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [isHost, setIsHost] = useState<boolean>(false);
  const [roomId, setRoomId] = useState<string>("");
  const [gameState, setGameState] = useState<GameState>({
    myHand: null,
    opponentHand: null,
    result: null,
    gameId: "",
  });
  const [isWaiting, setIsWaiting] = useState<boolean>(false);
  const [iceCandidates, setIceCandidates] = useState<RTCIceCandidate[]>([]);
  const [isGatheringComplete, setIsGatheringComplete] =
    useState<boolean>(false);

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);

  const initializePeerConnection = () => {
    peerConnection.current = new RTCPeerConnection(STUN_SERVERS);
    setIceCandidates([]);
    setIsGatheringComplete(false);

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("ICE candidate:", event.candidate);
        setIceCandidates((prev) => [...prev, event.candidate!]);
      } else {
        // ICE gathering完了
        console.log("ICE gathering completed");
        setIsGatheringComplete(true);
      }
    };

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current?.connectionState;
      console.log("Connection state changed:", state);
      if (state === "connected") {
        setConnectionState("connected");
      } else if (state === "disconnected" || state === "failed") {
        setConnectionState("disconnected");
      }
    };

    peerConnection.current.oniceconnectionstatechange = () => {
      const state = peerConnection.current?.iceConnectionState;
      console.log("ICE connection state:", state);
    };
  };

  const createOffer = async () => {
    if (!peerConnection.current) return;

    dataChannel.current = peerConnection.current.createDataChannel("game");
    setupDataChannel();

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    return offer;
  };

  const createAnswer = async (connectionData: ConnectionData) => {
    if (!peerConnection.current) return;

    peerConnection.current.ondatachannel = (event) => {
      dataChannel.current = event.channel;
      setupDataChannel();
    };

    // リモート記述を設定
    await peerConnection.current.setRemoteDescription(connectionData.sdp);

    // ICE候補を追加
    for (const candidate of connectionData.candidates) {
      try {
        await peerConnection.current.addIceCandidate(candidate);
        console.log("Added ICE candidate:", candidate);
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    }

    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);

    return answer;
  };

  const setupDataChannel = () => {
    if (!dataChannel.current) return;

    dataChannel.current.onopen = () => {
      console.log("Data channel opened");
      setConnectionState("connected");
    };

    dataChannel.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleMessage(data);
    };
  };

  const sendMessage = (message: any) => {
    if (dataChannel.current && dataChannel.current.readyState === "open") {
      dataChannel.current.send(JSON.stringify(message));
    }
  };

  const handleMessage = (data: any) => {
    switch (data.type) {
      case "handSelected":
        setGameState((prev) => ({
          ...prev,
          opponentHand: data.hand,
          gameId: data.gameId,
        }));

        if (gameState.myHand) {
          const result = determineWinner(gameState.myHand, data.hand);
          setGameState((prev) => ({
            ...prev,
            result,
            opponentHand: data.hand,
          }));
          setIsWaiting(false);
        }
        break;

      case "newGame":
        resetGame();
        break;
    }
  };

  const determineWinner = (myHand: Hand, opponentHand: Hand): GameResult => {
    if (!myHand || !opponentHand) return null;

    if (myHand === opponentHand) return "draw";

    const winConditions = {
      rock: "scissors",
      paper: "rock",
      scissors: "paper",
    };

    return winConditions[myHand] === opponentHand ? "win" : "lose";
  };

  const selectHand = (hand: Hand) => {
    if (!hand || gameState.myHand || connectionState !== "connected") return;

    const gameId = Date.now().toString();
    setGameState((prev) => ({
      ...prev,
      myHand: hand,
      gameId,
    }));
    setIsWaiting(true);

    sendMessage({
      type: "handSelected",
      hand,
      gameId,
    });

    if (gameState.opponentHand) {
      const result = determineWinner(hand, gameState.opponentHand);
      setGameState((prev) => ({
        ...prev,
        result,
      }));
      setIsWaiting(false);
    }
  };

  const resetGame = () => {
    setGameState({
      myHand: null,
      opponentHand: null,
      result: null,
      gameId: "",
    });
    setIsWaiting(false);
  };

  const startNewGame = () => {
    resetGame();
    sendMessage({ type: "newGame" });
  };

  const createRoom = async () => {
    const newRoomId = Math.random().toString(36).substring(2, 8);
    setRoomId(newRoomId);
    setIsHost(true);
    setConnectionState("connecting");

    initializePeerConnection();
    await createOffer();

    console.log("Room created:", newRoomId);
    console.log("Waiting for ICE gathering to complete...");
  };

  // ICE gathering完了時にOfferを表示
  useEffect(() => {
    if (
      isHost &&
      isGatheringComplete &&
      peerConnection.current?.localDescription
    ) {
      const connectionData: ConnectionData = {
        sdp: peerConnection.current.localDescription,
        candidates: iceCandidates,
      };
      console.log("=== COPY THIS OFFER ===");
      console.log(JSON.stringify(connectionData));
      console.log("======================");
    }
  }, [isHost, isGatheringComplete, iceCandidates]);

  const joinRoom = async () => {
    if (!roomId) return;

    setIsHost(false);
    setConnectionState("connecting");

    const offerText = prompt("Paste the offer from the host:");
    if (!offerText) return;

    try {
      const connectionData: ConnectionData = JSON.parse(offerText);
      initializePeerConnection();
      await createAnswer(connectionData);

      console.log("Waiting for ICE gathering to complete...");
    } catch (error) {
      console.error("Invalid offer format");
      alert("無効なオファー形式です");
    }
  };

  // ゲスト側のICE gathering完了時にAnswerを表示
  useEffect(() => {
    if (
      !isHost &&
      isGatheringComplete &&
      peerConnection.current?.localDescription
    ) {
      const connectionData: ConnectionData = {
        sdp: peerConnection.current.localDescription,
        candidates: iceCandidates,
      };
      console.log("=== COPY THIS ANSWER ===");
      console.log(JSON.stringify(connectionData));
      console.log("========================");
    }
  }, [isHost, isGatheringComplete, iceCandidates]);

  const handleAnswerSubmit = async () => {
    const answerText = prompt("Paste the answer from the guest:");
    if (!answerText || !peerConnection.current) return;

    try {
      const connectionData: ConnectionData = JSON.parse(answerText);

      // リモート記述を設定
      await peerConnection.current.setRemoteDescription(connectionData.sdp);

      // ICE候補を追加
      for (const candidate of connectionData.candidates) {
        try {
          await peerConnection.current.addIceCandidate(candidate);
          console.log("Added ICE candidate:", candidate);
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    } catch (error) {
      console.error("Invalid answer format:", error);
      alert("無効なアンサー形式です");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-center mb-6">
          🪨📄✂️ P2P じゃんけん
        </h1>

        {/* ルームID表示 */}
        {roomId && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-700 font-medium">ルームID:</p>
            <p className="text-lg font-mono text-blue-900 break-all">
              {roomId}
            </p>
          </div>
        )}

        {connectionState === "disconnected" && (
          <div className="space-y-4">
            {/* 手順説明 */}
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <h2 className="text-lg font-semibold mb-3 text-gray-800">
                📋 接続手順
              </h2>
              <div className="space-y-3 text-sm text-gray-700">
                <div>
                  <p className="font-medium text-blue-600">
                    🏠 ルーム作成の場合:
                  </p>
                  <ol className="list-decimal list-inside ml-4 space-y-1">
                    <li>「ルーム作成」ボタンを押す</li>
                    <li>コンソールに表示される完全なOfferをコピー</li>
                    <li>相手にOfferを送信</li>
                    <li>相手から受け取った完全なAnswerを入力</li>
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-green-600">
                    🚪 ルーム参加の場合:
                  </p>
                  <ol className="list-decimal list-inside ml-4 space-y-1">
                    <li>ルームIDを入力（任意）</li>
                    <li>「ルーム参加」ボタンを押す</li>
                    <li>ホストからの完全なOfferを貼り付け</li>
                    <li>コンソールの完全なAnswerをホストに送信</li>
                  </ol>
                </div>
                <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                  <p className="text-xs text-yellow-700">
                    💡 ヒント:
                    ICE候補収集完了まで少し待ってからコピーしてください
                  </p>
                </div>
              </div>
            </div>

            <div>
              <input
                type="text"
                placeholder="ルームID (参加時のみ)"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="flex space-x-2">
              <button
                onClick={createRoom}
                className="flex-1 bg-blue-500 text-white p-2 rounded hover:bg-blue-600"
              >
                ルーム作成
              </button>
              <button
                onClick={joinRoom}
                className="flex-1 bg-green-500 text-white p-2 rounded hover:bg-green-600"
              >
                ルーム参加
              </button>
            </div>
          </div>
        )}

        {connectionState === "connecting" && (
          <div className="text-center">
            <p className="text-gray-600 mb-4">接続中...</p>
            {isHost ? (
              <div className="space-y-3">
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700">
                  <p className="font-medium mb-2">📤 次のステップ:</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>ICE候補収集完了を待つ</li>
                    <li>コンソールの完全なOfferを相手に送信</li>
                    <li>相手から完全なAnswerを受け取る</li>
                    <li>下のボタンでAnswerを入力</li>
                  </ol>
                  {isGatheringComplete ? (
                    <p className="text-green-600 mt-2">✅ ICE候補収集完了</p>
                  ) : (
                    <p className="text-yellow-600 mt-2">⏳ ICE候補収集中...</p>
                  )}
                </div>
                <button
                  onClick={handleAnswerSubmit}
                  className="bg-orange-500 text-white p-2 rounded hover:bg-orange-600"
                  disabled={!isGatheringComplete}
                >
                  相手の応答を入力
                </button>
              </div>
            ) : (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                <p className="font-medium mb-2">📥 次のステップ:</p>
                <p>
                  ICE候補収集完了後、コンソールの完全なAnswerをホストに送信してください
                </p>
                {isGatheringComplete ? (
                  <p className="text-green-600 mt-2">✅ ICE候補収集完了</p>
                ) : (
                  <p className="text-yellow-600 mt-2">⏳ ICE候補収集中...</p>
                )}
              </div>
            )}
          </div>
        )}

        {connectionState === "connected" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="text-green-600 font-semibold mb-4">
                ✅ 接続完了
              </div>

              {!gameState.myHand && !isWaiting && (
                <div>
                  <p className="mb-4">手を選んでください：</p>
                  <div className="flex justify-center space-x-4">
                    {Object.entries(HAND_EMOJIS).map(([hand, emoji]) => (
                      <button
                        key={hand}
                        onClick={() => selectHand(hand as Hand)}
                        className="text-4xl p-3 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(gameState.myHand || isWaiting) && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <div className="text-center">
                      <p className="text-sm text-gray-600">あなた</p>
                      <div className="text-4xl">
                        {gameState.myHand
                          ? HAND_EMOJIS[gameState.myHand]
                          : "❓"}
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
                    <p className="text-yellow-600">
                      相手の選択を待っています...
                    </p>
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
                      <button
                        onClick={startNewGame}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                      >
                        もう一度
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
