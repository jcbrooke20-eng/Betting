# Daily Card

NBA prop picker + bet tracker. Paste the Research Station CSV, press "Fetch DraftKings lines",
then "Find my 3 bets".

## Deploy
1. Put this folder in a GitHub repo, then in Vercel choose Add New > Project and import it.
   (Or run `npx vercel` inside this folder.)
2. In the project’s Settings > Environment Variables add:
   - `ODDS_API_KEY` = your key from the-odds-api.com
   - `ACCESS_CODE` = any password you choose (stops strangers from spending your API credits)
3. Redeploy so the variables take effect. Open the site, press "Fetch DraftKings lines",
   and enter your access code when asked.

Bet history is stored in your browser (localStorage), so it doesn’t sync between devices.
