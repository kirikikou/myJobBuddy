// Tester les limites
fetch('/plan/limits')
  .then(r => r.json())
  .then(data => console.log(data.restrictions));