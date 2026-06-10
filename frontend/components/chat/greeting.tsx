import { motion } from "framer-motion";

const SAMPLE_PROMPTS = [
  "swap 0.001 STT to USDC",
  "Get Top 3 token holders of USDC",
  "get wallet networth of 0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
];

export function Greeting({ onSubmit }: { onSubmit: (text: string) => void }) {
  return (
    <div className="flex flex-col items-center px-4" key="overview">
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="text-center font-semibold text-2xl tracking-tight text-foreground md:text-3xl"
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.35, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        AI Copilot for Somnia
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mt-3 text-center text-muted-foreground text-base"
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.5, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        Use natural language to swap tokens and access on-chain data across the Somnia blockchain.
      </motion.div>
      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="mt-6 flex flex-wrap justify-center gap-2"
        initial={{ opacity: 0, y: 10 }}
        transition={{ delay: 0.65, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        {SAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            className="rounded-full border border-border/40 bg-card/30 px-4 py-1.5 text-[13px] text-muted-foreground/80 transition-colors hover:border-border/70 hover:bg-card/50 hover:text-foreground"
            onClick={() => onSubmit(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </motion.div>
    </div>
  );
}
