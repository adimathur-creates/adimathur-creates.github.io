# Who should TwentyTwo call? A COD confirmation call policy

Self-directed product spec by Aditya Mathur for Shiprocket TwentyTwo (AI voice). Illustrative assumptions, no Shiprocket data.

**Problem:** a seller judges a COD confirmation call by delivered orders and RTO cost; voice vendors report confirmation rate. Calling every COD order pays for calls that change nothing and talks some genuine buyers out of their order.

**What's here**
- `index.html`: the spec, with a live simulator (call economics by risk band, break-even risk, pilot sizes), the call design in Hinglish, a launch gate and a pilot plan.
- `model.js`: the economics model used by the page and the tests.
- `tests/model.test.js`: 16 tests (`node tests/model.test.js`).

**Finding at default assumptions:** the confirmation rate ranks bands backwards (low risk: 97% confirmed, loses about Rs 3 per call; high risk: 72% confirmed, earns about Rs 57 per call). Calling only above a break-even risk of about 10% halves call spend and nets about 10% more than calling everyone. A holdout inside each band proves it on real sellers.

Live: https://adimathur-creates.github.io/shiprocket-who-to-call/
