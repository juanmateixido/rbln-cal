# Public, disposable CI fixtures. Never source Infisical or runtime credentials here.
export DATABASE_URL=postgresql://postgres@127.0.0.1:5432/calendso
export DATABASE_DIRECT_URL=postgresql://postgres@127.0.0.1:5432/calendso
export NEXTAUTH_SECRET=ci-only-no-production-access
export CALENDSO_ENCRYPTION_KEY=00000000000000000000000000000000
