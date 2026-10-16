interface Session {
    isLoggedIn(): boolean;
    getDevices(): Promise<unknown>;
    login(username: string, password: string, isHashed: boolean): Promise<boolean>;
}

/** One background session check; no overlapping logins or tight retry loops. */
export default class SessionRecovery {
    private busy = false;
    private nextAttempt = 0;
    private failures = 0;

    constructor(
        private readonly session: Session,
        private readonly credentials: () => {username: string; password: string},
        private readonly report: (message: string) => void,
        private readonly now: () => number = Date.now,
    ) {}

    async tick(): Promise<void> {
        if (this.busy || this.now() < this.nextAttempt) return;
        const {username, password} = this.credentials();
        if (!username || !password) {
            this.nextAttempt = this.now() + 60_000;
            return;
        }
        this.busy = true;
        try {
            let healthy = false;
            if (this.session.isLoggedIn()) {
                try { await this.session.getDevices(); healthy = true; }
                catch { /* An expired session can require a new login. */ }
            }
            if (!healthy && !await this.session.login(username, password, true)) {
                throw new Error("VeSync did not establish a session");
            }
            if (!healthy || this.failures) this.report("VeSync session is ready.");
            this.failures = 0;
            this.nextAttempt = this.now() + 15 * 60_000;
        } catch (error) {
            this.failures++;
            const message = error instanceof Error ? error.message : String(error);
            // Account lockouts remain enforced by VeSync.login as well.
            const credentialsProblem = /password|credential|locked|verification|2fa|two.factor|account.*(?:invalid|not.*exist)/i.test(message);
            const delay = credentialsProblem ? 60 * 60_000
                : Math.min(15 * 60_000, 60_000 * 2 ** Math.min(this.failures - 1, 4));
            this.nextAttempt = this.now() + delay;
            // Never log the credentials or a raw authentication response here.
            this.report(`VeSync session unavailable; retrying in ${delay / 60_000} minute(s).${credentialsProblem ? " Check account credentials if this persists." : ""}`);
        } finally { this.busy = false; }
    }
}
