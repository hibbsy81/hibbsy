# Fixtures & UK TV guide
1. Push this folder to a GitHub repo.
2. Settings > Pages > Deploy from branch > main / root.
3. Settings > Actions > General > Workflow permissions > Read and write.
4. Actions tab > "Update fixtures" > Run workflow (then it runs every 6 hours).
Check the Action log: each team should report more than 0 fixtures. If one reports 0, fix its page slug in scripts/update.py.
Optional logos: see logos/README.md.
