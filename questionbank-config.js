/*
  OPTIONAL OVERRIDE FILE.

  IB Race v5.1 already defaults to Ommodi directly inside app.js:
    https://ommodi.site/questionbanks/race.json
    https://ommodi.site/questionbanks/practice.json

  Leave this file as-is unless you want to override those URLs later.
*/
window.IBRACE_QUESTION_BANKS = {
  race: {
    url: 'https://ommodi.site/questionbanks/race.json',
    fallback: './questionbanks/race.json'
  },
  practice: {
    url: 'https://ommodi.site/questionbanks/practice.json',
    fallback: './questionbanks/practice.json'
  }
};
