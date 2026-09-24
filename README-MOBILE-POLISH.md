# Mobile Polish Upgrade

Replace these 2 files:
- app/globals.css
- app/orders/new/page.tsx

No SQL is needed.

Changes:
- Mobile bottom navigation is now inside a floating rounded frame with cleaner button cards.
- Delivery fee and discount fields start empty.
- A faint `0` is shown only as a placeholder.
- Operator can tap and type the amount immediately without deleting a real zero.
- Calculations still treat an empty field as 0.
