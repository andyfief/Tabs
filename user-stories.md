# User Stories

## Onboarding

- As a new user, I want to create an account so that I can start tracking shared expenses.
- As a new user, I want to connect my Venmo OR Cash App handle during onboarding so that others can pay me easily.
- As a new user, I want to be able to skip connecting a payment handle and add it later so that I can get started quickly.

## Creating & Managing Tabs

- As a user, I want to create a new tab (event) so that I can track shared expenses for a specific occasion.
- As a user, I want to give a tab a name and description so that members know what the tab is for.
- As a tab member, I want to invite other users to my tab so that we can all log and split expenses together.
- As a user, I want to join a tab via an invite so that I can participate in expense tracking for an event.
- As a tab member, I want to view all members of a tab so that I know who is part of the group.

## Logging Expenses

- As a tab member, I want to log a new expense by entering a payer, an expense title, the tab members who will split the cost, and an amount so that the group can track who paid for what.
- As a tab member, when I create an expense, I should default to be a payer of that expense and my portion should be taken from the total owed to me.
- As a tab member, if I am not a part of the group splitting an expense but I am creating the expense log, I can remove myself from the expense.
- As a tab member, I want to select which members share a given expense so that costs are only split among the relevant people.
- As a tab member, I want the expense cost to split evenly among selected members so that balances are calculated fairly.
- As a tab member, I want to see a list of all expenses logged in a tab so that I have a full record of purchases.

## Real-Time Balances

- As a tab member, I want balances to update in real time as expenses are added so that I always see the current state of the tab.
- As a tab member, I want to see each person's net balance within a tab so that it is clear who owes what to whom.
- As a tab member, I only want to track remaining/differences in balances, such that I only ever owe one person one amount.

## Home Screen

- As a user, I want my home screen to show a consolidated summary of all my open tabs so that I can see my full financial picture at a glance.
- As a user, I want to see exactly what I owe and to whom across all tabs so that I know my total outstanding obligations.
- As a user, I want to see what others owe me across all tabs so that I can track incoming payments.
- As a user, I want to mark a payment as paid using a checkbox so that balances reflect settled amounts.

## Checkboxes
- As a user, when I check off a balance that I owe somebody, I no longer recieve any notifications from that tab.
- As a user, I want my checkboxes to be either per-tab or per-person toggleable. Per tab shows my balances from each tab and can have multiple boxes for a single person that I owe, if I owe that person across multiple tabs. Per-person toggle collapses those debts into one box per person.
- As a user, I want to either click on the debt that I owe (the name of the person/title) or the checkbox next to it.
- As a user, clicking on the name/title of a debt generates deep links of their attached venmo / cash app.
- As a user, clicking on the checkbox next to a debt marks it as paid.
- As a user, when I check a debt's box as paid, it is reflected within the tab interface for the recipient, but does not remove it from the recipients view - allowing personal verification.
- As a user, I want to see who has claimed to have paid me for debts so that I can verify those payments myself.

## Closing a Tab

- As a tab creator, I want to close a tab when the event is over so that final balances are settled and the tab is archived.
- As a user, I want to be informed that closing a tab requires a purchase so that I understand the paywall before proceeding.
- As a user, I want the option to make a one-time purchase to close a tab so that I am not locked into a subscription.
- As a user, I want the option to subscribe so that I can close tabs repeatedly without additional one-time fees.

## Payments & Notifications on Close

- As a tab member who owes money, I want to receive an SMS with my balance and a Venmo/Cash App deep link when a tab is closed so that I can pay easily.
- As a tab member, I want to receive a push notification when a tab is closed so that I know to review and settle my balance.
- As a tab creator, I want Venmo and Cash App payment links to be automatically generated for each member with an outstanding balance so that payment collection requires no manual work.
