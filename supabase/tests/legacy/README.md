Retired suites. They assert database states from before later hardening (pre-lockdown grants,
referral "qualified at signup", `payment_sessions.order_id NOT NULL`, ...) and fail by design on
the current schema, which hid real failures in the run output. Kept for history; not part of the
regression run. Current suites live one folder up.
