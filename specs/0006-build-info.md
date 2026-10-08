# Build info in page footer

We want to show the build info in the footer of our Porridge Pot's website

## Acceptance criteria

- Add a placeholder in the app footer for the build info
- During frontend build, replace the placeholder with a timestamp and a Git commit short hash
- Show the build begin time in the footer - format 'dd.MM.yyyy HH:mm:ss', 'HH' meaning the 24-hour clock
- Show the short hash (the first 7 characters) of the Git commit that is being built

## Boundaries

- All changes must stay within apps/web/
- Generate the build metadata in apps/web/vite.config.js
- No modification of backend or infrastructure should be required

