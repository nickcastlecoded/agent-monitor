import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { LogIn, Loader2, AlertCircle } from "lucide-react";

function AgentMonitorLogo() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 28 28"
      fill="none"
      aria-label="Agent Monitor"
      className="shrink-0"
    >
      <rect x="2" y="2" width="24" height="24" rx="6" stroke="currentColor" strokeWidth="2" />
      <circle cx="10" cy="12" r="2.5" fill="currentColor" />
      <circle cx="18" cy="12" r="2.5" fill="currentColor" />
      <path d="M9 19c0 0 2 2.5 5 2.5s5-2.5 5-2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="11" y="3" width="6" height="3" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      const msg = err?.message || "Login failed";
      if (msg.includes("401")) {
        setError("Invalid email or password");
      } else {
        setError(msg);
      }
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo & Heading */}
        <div className="flex flex-col items-center text-center space-y-4">
          <AgentMonitorLogo />
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              Meet your Managed Intelligence.
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to access the dashboard
            </p>
          </div>
        </div>

        {/* Login Form */}
        <Card className="border-card-border">
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  autoFocus
                  data-testid="input-login-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  data-testid="input-login-password"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !email || !password}
                data-testid="button-login"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-1.5" />
                    Sign In
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center">
          <a
            href="https://www.perplexity.ai/computer"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Created with Perplexity Computer
          </a>
        </p>
      </div>
    </div>
  );
}
