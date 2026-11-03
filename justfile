# run the application
run: 
    pnpm dev

# run the application with calendar/API secrets injected from 1Password
# (needs .env.op.local containing op:// references)
run-op:
    op run --env-file=.env.op.local -- pnpm dev
