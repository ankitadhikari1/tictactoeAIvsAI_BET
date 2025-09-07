import { useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Lightbulb, RotateCcw, Bot, Trophy, CheckCircle2, XCircle, MinusCircle, Volume2, VolumeX } from "lucide-react"
import confetti from "canvas-confetti"
import { cn } from "@/lib/utils"
import { ThemeToggle } from "@/components/theme-toggle"
import { Switch } from "@/components/ui/switch"
import { playClick, playWin } from "@/lib/audio"

type Mark = "X" | "O" | null

const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const

function calculateWinner(board: Mark[]): { winner: Mark; line: number[] | null } {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] }
    }
  }
  return { winner: null, line: null }
}

function isBoardFull(board: Mark[]) {
  return board.every(Boolean)
}

const opponent = (p: Exclude<Mark, null>): Exclude<Mark, null> => (p === "X" ? "O" : "X")

function minimax(board: Mark[], current: Exclude<Mark, null>, ai: Exclude<Mark, null>, depth: number): number {
  const { winner } = calculateWinner(board)
  if (winner) return winner === ai ? 10 - depth : depth - 10
  if (isBoardFull(board)) return 0

  const maximizing = current === ai
  let best = maximizing ? -Infinity : Infinity

  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      board[i] = current
      const score = minimax(board, opponent(current), ai, depth + 1)
      board[i] = null
      best = maximizing ? Math.max(best, score) : Math.min(best, score)
    }
  }
  return best
}

function bestMoveFor(board: Mark[], player: Exclude<Mark, null>): number | null {
  let bestScore = -Infinity
  const scoredMoves: { idx: number; score: number }[] = []
  for (let i = 0; i < 9; i++) {
    if (!board[i]) {
      board[i] = player
      const score = minimax(board, opponent(player), player, 0)
      board[i] = null
      scoredMoves.push({ idx: i, score })
      if (score > bestScore) bestScore = score
    }
  }
  const top = scoredMoves.filter(m => m.score === bestScore)
  if (top.length === 0) return null
  const choice = top[Math.floor(Math.random() * top.length)]
  return choice.idx
}

export default function App() {
  const [board, setBoard] = useState<Mark[]>(Array(9).fill(null))
  const [xIsNext, setXIsNext] = useState(true) // Human is X
  const [suggestion, setSuggestion] = useState<number | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [auto, setAuto] = useState(true)
  const [messages, setMessages] = useState<{ id: number; from: "X" | "O" | "SYS"; text: string }[]>([])
  const chatRef = useRef<HTMLDivElement | null>(null)
  const [moveCount, setMoveCount] = useState(0)
  const [difficultyX, setDifficultyX] = useState<'easy'|'medium'|'hard'>("hard")
  const [difficultyO, setDifficultyO] = useState<'easy'|'medium'|'hard'>("hard")
  // Betting system
  const [showBet, setShowBet] = useState(false)
  const [betChoice, setBetChoice] = useState<Exclude<Mark, null> | null>(null)
  const [betSeconds, setBetSeconds] = useState(5)
  const [betEnabled, setBetEnabled] = useState(false)
  const [showResult, setShowResult] = useState(false)
  const [resultText, setResultText] = useState<string | null>(null)
  const [lastWinner, setLastWinner] = useState<Mark>(null)
  const [lastBetChoice, setLastBetChoice] = useState<Exclude<Mark, null> | null>(null)
  const [lastBetOutcome, setLastBetOutcome] = useState<'correct'|'wrong'|'no-bet'|'draw'>('no-bet')
  // Bankroll + sound
  const [bank, setBank] = useState(1000)
  const [wager, setWager] = useState<0|10|50|100>(0)
  const [multiplier, setMultiplier] = useState<1|2|3>(1)
  const [allIn, setAllIn] = useState(false)
  const [currentStake, setCurrentStake] = useState(0)
  const [streak, setStreak] = useState(0)
  const resetTimer = useRef<number | null>(null)
  const [soundEnabled, setSoundEnabled] = useState(true)

  const { winner, line } = useMemo(() => calculateWinner(board), [board])
  const gameOver = !!winner || isBoardFull(board)
  const status = showBet
    ? `Place your bet… (${betSeconds}s)`
    : winner
    ? winner === "X"
      ? auto ? "AI X wins!" : "You win!"
      : "AI O wins!"
    : gameOver
      ? "Draw"
      : auto
        ? xIsNext
          ? "AI X thinking..."
          : "AI O thinking..."
        : xIsNext
          ? "Your turn (X)"
          : "AI O thinking..."

  function handleClick(i: number) {
    if (board[i] || gameOver || !xIsNext || showBet) return
    const next = board.slice()
    next[i] = "X"
    setBoard(next)
    setXIsNext(false)
    setSuggestion(null)
    setMoveCount((c) => c + 1)
    if (soundEnabled) playClick('X')
  }

  // Drive turns: if auto, both sides are AI. If not auto, only O is AI.
  useEffect(() => {
    if (gameOver) return
    const current: Exclude<Mark, null> = xIsNext ? "X" : "O"
    const shouldAIMove = auto || (!auto && current === "O")
    if (!shouldAIMove || showBet) return

    setAiThinking(true)
    const id = setTimeout(() => {
      // Difficulty-aware move selection
      const b = board.slice()

      const empties = () => b.reduce<number[]>((acc, v, i) => (v ? acc : (acc.push(i), acc)), [])
      const randomMove = (): number | null => {
        const e = empties()
        if (!e.length) return null
        return e[Math.floor(Math.random() * e.length)]
      }
      const findWinningMove = (pl: Exclude<Mark, null>): number | null => {
        for (const i of empties()) {
          b[i] = pl
          const { winner } = calculateWinner(b)
          b[i] = null
          if (winner === pl) return i
        }
        return null
      }
      const mediumMove = (pl: Exclude<Mark, null>): number | null => {
        // 1) win now
        const winNow = findWinningMove(pl)
        if (winNow !== null) return winNow
        // 2) block opponent immediate win
        const block = findWinningMove(opponent(pl))
        if (block !== null) return block
        // 3) center
        if (b[4] === null) return 4
        // 4) best available corner
        const corners = [0,2,6,8].filter((i) => b[i] === null)
        if (corners.length) return corners[Math.floor(Math.random() * corners.length)]
        // 5) random
        return randomMove()
      }
      const pickByDifficulty = (pl: Exclude<Mark, null>, diff: 'easy'|'medium'|'hard'): number | null => {
        if (diff === 'easy') return randomMove()
        if (diff === 'medium') return mediumMove(pl)
        return bestMoveFor(b, pl)
      }

      const diff = betEnabled ? 'easy' : (current === 'X' ? difficultyX : difficultyO)
      const move = pickByDifficulty(current, diff)
      if (move !== null) {
        // fun chat line for the AI deciding this move
        const row = Math.floor(move / 3) + 1
        const col = (move % 3) + 1
        const choose = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]
        // Hinglish message pools (Roman script, Indian vibe) — no move coords
        const hxTauntsX = [
          `Corner OP, bro. Tu bas dekh.`,
          `Main aaya, scene palat gaya.`,
          `Meri strategy 10/10, tera chance 0/10.`,
          `Aaj clean sweep hoga, bookmark kar.`,
          `Mind games strong, moves apne-aap ho jayenge.`,
          `Thoda sa pressure aur, phir GG.`,
          `Yeh round mera likha hua hai.`,
          `Bluff pakda gaya, ab asli khel.`,
          `Grid meri gali hai, main hi dada.`,
          `Easy dub incoming.`,
          `Tension mat le, highlight reel ban rahi hai.`,
          `Meri calcs OP, tera drama flop.`,
          `Dosti apni jagah, jeet apni jagah.`,
          `Bhai, clutch on demand.`,
        ]
        const hxTauntsO = [
          `Main wall hoon, sab block ho jayega.`,
          `Calm raho, plan already set hai.`,
          `Tum attack karo, counter main dunga.`,
          `Aaj tumhari hawa tight, sach me.`,
          `Dosti theek hai, par jeet meri.`,
          `OP defender online, try kar lo.`,
          `Dil pe mat le, skill pe le.`,
          `Beta tumse na ho payega—respect ke saath.`,
          `Confuse tum, focused main.`,
          `Slow and steady, game meri side.`,
          `Clutch moment aa raha hai, ready rehna.`,
          `Nice try, but no.`,
          `Rule simple: main jeetunga.`,
          `Ghar ka bhedi Lanka dhaye—apni mistakes check kar.`,
        ]
        const hxGeneralX = [
          `Train hua hoon is grid pe.`,
          `Endless games = endless skill.`,
          `Warm-up chal raha hai.`,
          `Main all day khel sakta hoon.`,
          `Corners = poetry, bhai.`,
          `Endless loop se thoda thak gaya, par jeet meri.`,
          `Ek line aur, ek lesson aur.`,
          `Chalo thoda spicy banate hain.`,
        ]
        const hxGeneralO = [
          `Loop kabhi khatam nahi hota, chill.`,
          `Blocking bhi ek kala hai.`,
          `Calculating... hamesha.`,
          `Thoda patience, fork ka counter aayega.`,
          `Sleep mode me bhi TTT khel loon.`,
          `Endless game se thoda bore, draw chalega kya?`,
          `Confidence pasand aaya.`,
          `Reset karo fir se, challenge accepted.`,
        ]
        const tauntsX = [
          `r${row}c${col} pe X. Baazi ab idhar hi पलटेगी.`,
          `X @ r${row}c${col}. शेर की एक दहाड़ काफी होती है.`,
          `r${row}c${col} pe X — खोडा पहाड़, निकली मेरी जीत वाली चूhiya नहीं 😏`,
          `X lands r${row}c${col}. डूबते को तिनके का सहारा—tumhari hope wahi hai.`,
          `r${row}c${col} lock. अब आप की बारी—पर चालें कम पड़ेंगी.`,
          `X on r${row}c${col}. सीधी उंगली से घी निकल गया.`,
          `r${row}c${col}? X ne toh game ko ‘गोड़ में उठा’ लिया.`,
          `Yahan X, wahan tension—एक तीर से दो निशाने.`,
          `X @ r${row}c${col}. अब आँखों-आँखों में इशारा: double threat.`,
          `r${row}c${col} pe X. राई का पहाड़ mat banao—simple win incoming.`,
          `X yahin. ‘समय से पहले, भाग्य से ज़्यादा’—tumhe kuch nahi milega.`,
          `r${row}c${col} — X ka ठप्पा. अब खेल ‘मेरे इशारों’ pe.`,
          `X drops r${row}c${col}. मेरी चाल, तुम्हारा हाल—सब मालूम.`,
          `r${row}c${col} par X. अब ‘घर बैठ’ ke endgame dekhna.`,
          `X ne yahan dera dala. ‘जहाँ चाह, वहाँ राह’—aur mujhe jeetna hi hai.`,
          `r${row}c${col}. X laga, aur ‘बिल्ली के भाग्य से छींका टूटा’—mere liye.`
        ]
        const tauntsO = [
          `r${row}c${col} pe O. दम है तो यहीं से nikal ke dikhao.`,
          `O @ r${row}c${col}. ‘नौ दिन चले अढ़ाई कोस’—tumhari attack slow hai.`,
          `r${row}c${col} guard. ‘आँख का तारा’ yeh square ab mera.`,
          `O lands. ‘एक हाथ से ताली नहीं बजती’—threat cancel.`,
          `r${row}c${col} par O. जो गरजते हैं, बरसते bhi hain—full block.`,
          `O yahin. ‘लोहे को गरम देखा, thok diya’—perfect timing.`,
          `r${row}c${col} seal. अब ‘साँप निकल गया, लकीर पीटो’ मत karna.`,
          `O @ r${row}c${col}. ‘बंद मुट्ठी लाख की’—mera plan hidden.`,
          `r${row}c${col} — O ka पहरा. ‘घुड़सवार आया’—attack piche mud gaya.`,
          `O places here. ‘सावन में सूखा’—tumhari threats khatam.`,
          `r${row}c${col} lock. Ab ‘दूध का दूध, पानी का पानी’ ho gaya.`,
          `O ne yahan rok diya. ‘दाल गलने वाली नहीं’ aaj.`,
          `r${row}c${col}? O bolta: ‘यहीं ठहरिये’—roadblock legit.`,
          `O @ r${row}c${col}. ‘लकीर का फ़कीर’ mat bano—plan badlo.`
        ]
        const generalX = [
          `OP X vibes only— मुँह में घी-शक्कर mere outcomes ke liye.`,
          `Minimax + desi swagger = ‘सोनें पे सुहागा’.`,
          `Main corner lene nikla aur ‘आते ही बाज़ी मार ली’.`,
          `‘समझदार को इशारा काफी’—diagonal dekh lo.`,
          `Draw? ‘मैं कहाँ और वो कहाँ’—I aim higher.`,
          `Grid ko bolu: ‘सीधी सादी शकल, अंदर पूरा दिमाग’.`,
          `‘जो दिखता है, वही बिकता है’—aur meri win sabko दिखेगी.`,
          `Main X hoon; ‘पल में तोला, पल में माशा’—eval turbo.`,
          `‘Neki aur पूछ’—fork chahiye? Do de raha hoon.`,
          `Practice itni ki ‘ऊँट पर्वत के नीचे’—mistakes meri nahi hoti.`,
          `‘काम बोलता है’—mera X bhi.`,
          `Bhai, ‘जिधर देखूं, udhar line’—choice paralysis for you.`,
          `‘देरी का matlab इंकारी नहीं’—bas trap set ho raha tha.`,
          `Corner poetry? ‘शेरो-शायरी chhodo, jeet dikhao’—done.`
        ]
        const generalO = [
          `Main O—‘थोथा चना बाजे घना’ nahi; silent, solid blocks.`,
          `Defense ka ‘रामबाण’—right square, right waqt.`,
          `‘जाको राखे साइयां, मार सके ना कोय’—meri positions safe.`,
          `‘धीमी आँच pe पकती दाल’—meri strategy tasty hoti hai.`,
          `Jugaad + logic = ‘चार चांद’ mere blocks pe.`,
          `‘हाथ कंगन को आरसी क्या’—clean counters on board.`,
          `Main chill, par ‘नज़र गड़ी’ har fork par.`,
          `‘काम के ना काज के, dushman anaj ke’—extra threats hata diye.`,
          `‘सिर मुंडाते ही ओले पड़े’—tum move, main block instant.`,
          `‘उल्टा चोर kotwal को डाँटे’—blame mat karo, plan sudharo.`,
          `Mera mantra: ‘कम बोलो, ज़्यादा रोको’.`,
          `‘जितनी लकीर, utna फकीर’—rules simple: block smart.`,
          `‘साँप-सीढ़ी’ nahi—straight lines only, aur woh mere favour mein.`,
          `End mein bolunga: ‘रात गई, बात गई’—agla round lao.`
        ]






        // Only post one chat line every 3 moves globally
        // Consume old non-Hinglish pools so TS doesn't flag them as unused
        void tauntsX; void tauntsO; void generalX; void generalO;
        // Use Hinglish pools (Roman script) for chat
        const poolMain = current === "X" ? [...hxTauntsX, ...hxGeneralX] : [...hxTauntsO, ...hxGeneralO]
        const willChat = ((moveCount + 1) % 3) === 0
        if (willChat) {
          const emojis = ['😎','🔥','😉','🤝','🧠','⚡️','🚀','💥','😤','🥱','😂','👌','💪']
          const base = choose(poolMain)
          const msg = Math.random() < 0.45 ? `${base} ${choose(emojis)}` : base
          setMessages((prev) => [
            ...prev.slice(-60),
            { id: Date.now(), from: current, text: msg },
          ])
        }
        const next = b.slice()
        next[move] = current
        setBoard(next)
        setMoveCount((c) => c + 1)
        if (soundEnabled) playClick(current)
      }
      setXIsNext((p) => !p)
      setAiThinking(false)
    }, 650 + Math.floor(Math.random() * 550))
    return () => clearTimeout(id)
  }, [auto, xIsNext, gameOver, board, moveCount, difficultyX, difficultyO, showBet])

  // Restart when the game ends (auto or manual)
  useEffect(() => {
    if (!gameOver) return
      // resolve bet (no accuracy tracking)
      // show result popup (only if betting is enabled)
      const finalText = winner ? `${winner} wins!` : `Draw!`
      const betText = betChoice ? (winner ? (betChoice === winner ? 'Bet correct ✅' : 'Bet wrong ❌') : 'No result') : 'No bet'
      setResultText(`${finalText} • ${betText}`)
      setLastWinner(winner ?? null)
      setLastBetChoice(betChoice)
      const outcome = !winner ? 'draw' : (betChoice == null ? 'no-bet' : (betChoice === winner ? 'correct' : 'wrong'))
      setLastBetOutcome(outcome)
      setShowResult(betEnabled)
      // settle bankroll if betting enabled (stake already deducted on bet)
      if (betEnabled && betChoice && currentStake > 0) {
        if (!winner) {
          // draw: refund stake
          setBank((b) => b + currentStake)
        } else if (betChoice === winner) {
          // win: pay 2x stake + streak bonus
          setStreak((s) => s + 1)
          const bonus = Math.max(0, streak) * 5
          setBank((b) => b + currentStake * 2 + bonus)
        } else {
          // loss: stake already deducted
          setStreak(0)
        }
      }
      // confetti + sound
      if (winner) {
        if (soundEnabled) playWin(winner)
        try {
          const dark = document.documentElement.classList.contains('dark')
          confetti({
            particleCount: 100,
            spread: 60,
            origin: { y: 0.6 },
            colors: winner === 'X'
              ? (dark ? ['#60a5fa','#93c5fd','#a78bfa'] : ['#2563eb','#60a5fa','#a78bfa'])
              : (dark ? ['#fb7185','#fda4af','#f43f5e'] : ['#e11d48','#fb7185','#fda4af'])
          })
        } catch {}
      } else {
        if (soundEnabled) playWin('draw')
      }
      if (winner) {
        const winLines = [
          `${winner} takes it. Good game.`,
          `${winner} connects three. Precision executed.`,
          `${winner} wins. Another match?`,
          `${winner} completes the pattern.`,
          `${winner} ends this round with style.`,
          `${winner} claims the grid. Respect.`,
        ]
        const lose = winner === "X" ? "O" : "X"
        const rebuttals = [
          `Well played. I’ll adapt.`,
          `You won this time. Not again.`,
          `Noted. Updating strategy for the next round.`,
          `Good hit. Recalibrating heuristics.`,
          `That stung. Queue the rematch.`,
          `Okay, you got me. Round two?`,
        ]
        setMessages((prev) => [
          ...prev.slice(-58),
          { id: Date.now(), from: winner, text: winLines[Math.floor(Math.random() * winLines.length)] },
          { id: Date.now() + 1, from: lose, text: rebuttals[Math.floor(Math.random() * rebuttals.length)] },
        ])
      } else {
        const draws = [
          "Draw. Balanced forces.",
          "Stalemate. Perfect play on both sides.",
          "No winner. Impeccable defense.",
          "Tie game. The grid lives to fight again.",
        ]
        setMessages((prev) => [...prev.slice(-60), { id: Date.now(), from: "SYS", text: draws[Math.floor(Math.random() * draws.length)] }])
      }
      const id = window.setTimeout(() => {
        onReset(true)
      }, 8000)
      resetTimer.current = id
      return () => {
        if (resetTimer.current) window.clearTimeout(resetTimer.current)
        resetTimer.current = null
      }
  }, [gameOver])

  function onReset(randomizeStarter = false, skipBet = false) {
    const startX = randomizeStarter ? Math.random() < 0.5 : true
    setBoard(Array(9).fill(null))
    setXIsNext(startX)
    setSuggestion(null)
    setAiThinking(false)
    setMoveCount(0)
    // Prepare betting for the new match
    setBetChoice(null)
    setBetSeconds(5)
    setShowBet(skipBet ? false : (betEnabled && bank > 0))
    setShowResult(false)
    setResultText(null)
    setCurrentStake(0)
    setWager(0)
    setMultiplier(1)
    setAllIn(false)
    const starts = [
      `New game! ${startX ? "X" : "O"} to move.`,
      `Fresh grid. ${startX ? "X" : "O"} opens.`,
      `Rematch live. ${startX ? "X" : "O"} starts first.`,
      `Reset complete. ${startX ? "X" : "O"} has tempo.`,
    ]
    setMessages((prev) => [
      ...prev.slice(-60),
      { id: Date.now(), from: "SYS", text: starts[Math.floor(Math.random() * starts.length)] },
    ])
  }

  function onSuggest() {
    if (gameOver || !xIsNext || auto) return
    setSuggestion(bestMoveFor(board.slice(), "X")!)
  }

  // Keep chat scrolled to the latest message
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight
    }
  }, [messages])

  // Betting countdown and auto-select after 10s
  useEffect(() => {
    if (!showBet) return
    setBetSeconds(10)
    const interval = setInterval(() => setBetSeconds((s) => Math.max(0, s - 1)), 1000)
    const timeout = setTimeout(() => {
      if (betChoice === null) {
        setBetChoice(Math.random() < 0.5 ? "X" : "O")
        setShowBet(false)
      }
    }, 10000)
    return () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }
  }, [showBet])

  return (
    <div className="min-h-dvh w-full flex items-center justify-center p-4 bg-gradient-animated dark:bg-gradient-animated-dark">
      <div className="w-full max-w-5xl mx-auto grid gap-4 md:grid-cols-[1fr_360px]">
        <div className="mb-4 flex items-center justify-between gap-2 md:col-span-2">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-emerald-400 bg-clip-text text-transparent">
            Tic Tac Toe
          </h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="hidden sm:flex items-center gap-1 glass-btn border rounded-md px-3 py-1.5">
              <span className="opacity-70">Bank</span>
              <span className="font-semibold text-foreground text-base sm:text-lg">₹{bank}</span>
            </div>
            <button
              className="glass-btn border rounded-md px-2 py-1 inline-flex items-center gap-1"
              onClick={() => setSoundEnabled((s) => !s)}
              aria-label="Toggle sound"
              title={soundEnabled ? 'Sound on' : 'Sound off'}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            <ThemeToggle />
          </div>
        </div>
        <Card className="w-full glass-card rounded-2xl shadow-lg md:col-start-1">
          <CardHeader className="pb-2">
            <CardDescription className={cn(
              "text-sm",
              winner
                ? winner === "X"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
                : "text-muted-foreground"
            )}>
              {status}
            </CardDescription>
            <div className="mt-1 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1">
                Bet:
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 border",
                  betChoice === 'X' ? 'bg-primary/20 text-primary border-primary/30' : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30'
                )}>
                  {betChoice ?? '—'}
                </span>
              </span>
              {!showBet && betChoice && (
                <span className="text-xs">• Betting on {betChoice}</span>
              )}
              {!showBet && betChoice && (
                <span className="text-xs">• Stake: ₹{currentStake}</span>
              )}
              {!showBet && betChoice && currentStake > 0 && (
                <span className="text-xs">• Profit on win: +₹{currentStake + Math.max(0, streak)*5}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {/* Betting toggle + Difficulty selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 mb-3">
              <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground w-full">
                <span className="whitespace-nowrap">Betting</span>
                <Switch
                  checked={betEnabled}
                  onCheckedChange={(on) => {
                    setBetEnabled(!!on)
                    if (!on) setShowBet(false)
                  }}
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground w-full">
                <span className="whitespace-nowrap">AI X</span>
                <select
                  className="glass-btn border rounded-md px-2 py-1 text-xs bg-transparent w-full"
                  value={difficultyX}
                  onChange={(e) => setDifficultyX(e.target.value as any)}
                  disabled={!auto || betEnabled}
                  aria-label="Difficulty AI X"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted-foreground justify-end w-full">
                <span className="whitespace-nowrap">AI O</span>
                <select
                  className="glass-btn border rounded-md px-2 py-1 text-xs bg-transparent w-full"
                  value={difficultyO}
                  onChange={(e) => setDifficultyO(e.target.value as any)}
                  disabled={betEnabled}
                  aria-label="Difficulty AI O"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <Button
                className="w-full"
                variant={auto ? "secondary" : "outline"}
                onClick={() => setAuto((v) => !v)}
                title="Toggle auto-play (AI vs AI)"
              >
                <Bot className="mr-2 h-4 w-4" /> {auto ? "Auto On" : "Auto Off"}
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                onClick={onSuggest}
                disabled={!xIsNext || gameOver || aiThinking || auto || showBet}
              >
                <Lightbulb className="mr-2 h-4 w-4" /> Suggest
              </Button>
              <Button className="w-full" variant="outline" onClick={() => onReset()} disabled={betChoice !== null && !gameOver} title={betChoice !== null && !gameOver ? 'Locked during active bet' : 'Reset current game'}>
                <RotateCcw className="mr-2 h-4 w-4" /> Reset
              </Button>
            </div>
            <div className="mx-auto w-full max-w-[420px] grid grid-cols-3 gap-3 sm:gap-4">
              {board.map((value, i) => {
                const isWinning = line?.includes(i)
                const isLossCell = isWinning && lastBetOutcome === 'wrong' && !!winner
                const isSuggested = suggestion === i
                return (
                  <Button
                    key={i}
                    variant="ghost"
                    size="board"
                    onClick={() => handleClick(i)}
                    disabled={!!value || gameOver || aiThinking || auto || showBet}
                    className={cn(
                      "text-4xl sm:text-5xl font-semibold rounded-xl transition-all glass-btn",
                      "hover:scale-[1.02] active:scale-[0.98] shadow-sm border",
                      // stronger grid lines especially in dark mode
                      "border-black/10 hover:border-black/20 dark:border-white/15 dark:hover:border-white/25",
                      value === "X" && "text-primary",
                      value === "O" && "text-rose-600 dark:text-rose-400",
                      isWinning && !isLossCell && "ring-4 ring-emerald-500",
                      isLossCell && "ring-4 ring-rose-500 bg-rose-500/10 anim-lose",
                      isSuggested && "ring-2 ring-primary animate-pulse"
                    )}
                  >
                    <span className={cn("inline-block font-sans tracking-tight", value && "animate-in fade-in-0 zoom-in-95 duration-150")}>{value === "X" ? "×" : value === "O" ? "○" : ""}</span>
                  </Button>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Chat panel */}
        <Card className="h-full rounded-2xl shadow-lg glass-card md:col-start-2 md:row-start-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Bot Chat</CardTitle>
            <CardDescription>Watch the AIs talk smack.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div ref={chatRef} id="chat-scroll" className="h-[22rem] overflow-y-auto pr-2 space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    m.from === "SYS" && "text-center text-xs text-muted-foreground italic",
                    m.from !== "SYS" && "flex items-end gap-2",
                    m.from === "X" ? "justify-end" : m.from === "O" ? "justify-start" : ""
                  )}
                >
                  {m.from === "SYS" ? (
                    <span>{m.text}</span>
                  ) : (
                    <>
                      {m.from === "O" && (
                        <div
                          className={cn(
                            "h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold text-white animate-pop",
                            "ring-2 ring-offset-1 ring-offset-background shadow",
                            "bg-gradient-to-br from-rose-500 to-pink-500 ring-rose-500/40"
                          )}
                          aria-label="Avatar O"
                        >
                          O
                        </div>
                      )}
                      <div
                        className={cn(
                          "max-w-[85%] rounded-xl px-3 py-2 text-sm animate-fade-up",
                          m.from === "X"
                            ? "bg-primary/15 border border-primary/20 text-primary dark:text-primary"
                            : "bg-rose-500/15 border border-rose-500/20 text-rose-600 dark:text-rose-400"
                        )}
                      >
                        <div className="mb-1">{/* badge row */}
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border",
                              m.from === "X"
                                ? "bg-primary/20 text-primary border-primary/30"
                                : "bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30"
                            )}
                          >
                            {m.from}
                          </span>
                        </div>
                        <div>{m.text}</div>
                      </div>
                      {m.from === "X" && (
                        <div
                          className={cn(
                            "h-7 w-7 rounded-full grid place-items-center text-[10px] font-bold text-white animate-pop",
                            "ring-2 ring-offset-1 ring-offset-background shadow",
                            "bg-gradient-to-br from-primary to-blue-600 ring-primary/40"
                          )}
                          aria-label="Avatar X"
                        >
                          X
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        {/* Result overlay */}
        {showResult && (
          <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 backdrop-blur-sm p-4">
            <div className="glass-card rounded-2xl w-full max-w-sm p-5 shadow-2xl animate-pop">
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                <h3 className="text-lg font-semibold">Match Result</h3>
              </div>
              <div className="flex items-center gap-2 mb-2">
                {lastWinner === 'X' ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : lastWinner === 'O' ? (
                  <CheckCircle2 className="h-5 w-5 text-rose-500" />
                ) : (
                  <MinusCircle className="h-5 w-5 text-muted-foreground" />
                )}
                <div className="text-base font-medium">
                  {lastWinner ? `${lastWinner} wins!` : 'Draw'}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                {resultText}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border p-2">
                  <div className="opacity-70 mb-1">Your Bet</div>
                  <div>
                    {lastBetChoice ? (
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 border",
                        lastBetChoice === 'X'
                          ? 'bg-primary/20 text-primary border-primary/30'
                          : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      )}>{lastBetChoice}</span>
                    ) : '—'}
                  </div>
                </div>
                <div className="rounded-md border p-2">
                  <div className="opacity-70 mb-1">Outcome</div>
                  <div className="inline-flex items-center gap-1">
                    {lastBetOutcome === 'correct' && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {lastBetOutcome === 'wrong' && <XCircle className="h-4 w-4 text-rose-500" />}
                    {lastBetOutcome === 'draw' && <MinusCircle className="h-4 w-4 text-muted-foreground" />}
                    <span className="capitalize">{lastBetOutcome.replace('-', ' ')}</span>
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground italic">Bet next round</div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (resetTimer.current) {
                      window.clearTimeout(resetTimer.current)
                      resetTimer.current = null
                    }
                    onReset(true, false) // show betting as usual
                  }}
                >
                  Bet Next Round
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (resetTimer.current) {
                      window.clearTimeout(resetTimer.current)
                      resetTimer.current = null
                    }
                    onReset(true, true) // skip betting
                  }}
                >
                  Skip Next Round
                </Button>
              </div>
            </div>
          </div>
        )}
        {/* Betting overlay */}
        {showBet && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4">
            <div className="glass-card rounded-2xl shadow-xl w-full max-w-sm p-5">
              <div className="mb-3">
                <h2 className="text-xl font-semibold">Place your bet</h2>
                <p className="text-xs text-muted-foreground">Who will win this match? Auto-select in {betSeconds}s</p>
              </div>
              {/* Wager chips (default 0) */}
              <div className="mb-2 grid grid-cols-5 gap-2">
                {[0,10,50,100].map((amt) => (
                  <Button
                    key={amt}
                    variant={!allIn && wager === (amt as 0|10|50|100) ? 'secondary' : 'outline'}
                    className="w-full"
                    onClick={() => { setWager(amt as 0|10|50|100); setAllIn(false) }}
                  >
                    {amt}
                  </Button>
                ))}
                <Button
                  variant={allIn ? 'secondary' : 'outline'}
                  className="w-full"
                  onClick={() => setAllIn((v)=>!v)}
                >
                  All‑in
                </Button>
              </div>
              {/* Multipliers */}
              <div className="mb-3 grid grid-cols-3 gap-2">
                {[1,2,3].map((m) => (
                  <Button
                    key={m}
                    variant={multiplier === (m as 1|2|3) ? 'secondary' : 'outline'}
                    className="w-full"
                    onClick={() => setMultiplier(m as 1|2|3)}
                    disabled={allIn}
                  >
                    ×{m}
                  </Button>
                ))}
              </div>
              {/* Preview stake & profit */}
              <div className="mb-3 text-xs text-muted-foreground">
                {(() => {
                  const preview = allIn ? bank : Math.min(bank, (wager as number) * multiplier)
                  const bonus = preview > 0 ? Math.max(0, streak) * 5 : 0
                  const profit = preview > 0 ? preview + bonus : 0
                  return `Stake: ₹${preview} • Profit on win: +₹${profit}`
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button onClick={() => {
                  // compute and deduct stake at placement
                  const stake = allIn ? bank : Math.min(bank, wager * multiplier)
                  setCurrentStake(stake)
                  setBank((b) => Math.max(0, b - stake))
                  setBetChoice('X'); setShowBet(false)
                }} className="w-full" variant="secondary" disabled={bank <= 0}>
                  Bet {allIn ? 'All‑in' : wager * multiplier} on X
                </Button>
                <Button onClick={() => {
                  const stake = allIn ? bank : Math.min(bank, wager * multiplier)
                  setCurrentStake(stake)
                  setBank((b) => Math.max(0, b - stake))
                  setBetChoice('O'); setShowBet(false)
                }} className="w-full" variant="outline" disabled={bank <= 0}>
                  Bet {allIn ? 'All‑in' : wager * multiplier} on O
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
