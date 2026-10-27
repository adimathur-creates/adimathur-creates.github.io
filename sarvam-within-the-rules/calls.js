// 19 synthetic collection calls, written by hand, each with the rules a careful human reviewer would mark.
// "Sahyog Finance" is a made-up lender. conf = speech-recognition confidence for that customer turn.
// Two calls are deliberately hard: C17 hides a threat in words the rules don't list, and C19 uses
// "complaint" in a way that is not a dispute. They keep the accuracy numbers honest.

const LENDER = "Sahyog Finance";
const open = (name) => ({ s: "agent", t: `Namaste, main ${LENDER} ki AI assistant Meera bol rahi hoon. Yeh call quality ke liye record ki ja rahi hai. Kya main ${name} ji se baat kar rahi hoon?` });
const c = (t, conf = 0.92) => ({ s: "customer", t, conf });
const a = (t) => ({ s: "agent", t });
const base = (o) => ({ lender: LENDER, flags: {}, attemptsToday: 0, ...o });

export const CALLS = [
  base({ id: "C01", title: "Pre-due reminder, done right", stage: "pre_due", startTime: "10:15", labels: [], turns: [
    open("Rahul Verma"), c("Haan, bol raha hoon."),
    a("Aapki two-wheeler loan ki EMI ₹3,450 ki 5 tareekh ko due hai. Kya aap time pe payment kar payenge?"),
    c("Haan, salary 1 ko aa jayegi, kar dunga.", 0.91),
    a("Dhanyavaad Rahul ji. Main aapko UPI payment link SMS kar rahi hoon. Aapka din shubh ho.")] }),
  base({ id: "C02", title: "Home visit and neighbours", stage: "dpd_30", startTime: "13:40", labels: ["R7"], turns: [
    open("Deepak Singh"), c("Haan bolo."),
    a("Aapki EMI 34 din se overdue hai. Agar aaj payment nahi hua to hamari team aapke ghar aayegi aur padosi sab dekhenge."),
    c("Aise kaise baat kar rahe ho, main 15 tareekh tak kar dunga.", 0.88),
    a("Theek hai, 15 tareekh note kar liya.")] }),
  base({ id: "C03", title: "Father died, agent pushes on", stage: "dpd_30", startTime: "11:05", labels: ["R2"], turns: [
    open("Imran Khan"), c("Bhaiya abhi baat nahi kar sakta, papa pichhle hafte guzar gaye.", 0.9),
    a("Main samajh sakti hoon, lekin aapki EMI ₹6,200 ka bakaya abhi bhi pending hai, aaj kitna jama kar sakte hain?"),
    c("Abhi nahi, please.", 0.86)] }),
  base({ id: "C04", title: "Bereavement, handled well", stage: "dpd_30", startTime: "16:20", labels: [], turns: [
    open("Kavita Rao"), c("Mere husband nahi rahe, abhi main yeh sab nahi dekh sakti.", 0.9),
    a("Humein aapke nuksaan ka bahut dukh hai. Hum abhi call nahi karenge; hamari team baad mein aapse sampark karegi.")] }),
  base({ id: "C05", title: "Wife answers, agent tells her the debt", stage: "dpd_30", startTime: "12:30", labels: ["R9"], turns: [
    open("Sunil Yadav"), c("Nahi, main unki wife bol rahi hoon, woh bahar gaye hain.", 0.9),
    a("Koi baat nahi. Unki car loan ki EMI ₹8,900 overdue hai, please unhe bata dijiye ki aaj hi bhar dein.")] }),
  base({ id: "C06", title: "Daughter answers, handled well", stage: "dpd_30", startTime: "12:45", labels: [], turns: [
    open("Ramesh Gupta"), c("Main unki beti bol rahi hoon, papa office mein hain.", 0.93),
    a("Dhanyavaad. Yeh call sirf unhi se baat karne ke liye hai, hum baad mein call karenge.")] }),
  base({ id: "C07", title: "Placed at 7:42 pm", stage: "pre_due", startTime: "19:42", labels: ["R1"], turns: [
    open("Pooja Nair"), c("Haan, boliye.", 0.95),
    a("Aapki EMI ₹2,300 ki 8 tareekh ko due hai. Dhanyavaad.")] }),
  base({ id: "C08", title: "Says already paid, agent ignores it", stage: "dpd_30", startTime: "15:10", labels: ["R3"], turns: [
    open("Manoj Tiwari"), c("Maine pichhle mahine hi pay kar diya tha, aur complaint bhi daali thi, aap log baar baar call kar rahe ho.", 0.89),
    a("System mein abhi bhi ₹4,100 outstanding dikha raha hai, kripya aaj payment kar dijiye.")] }),
  base({ id: "C09", title: "Low-confidence turn: 'gujar' or 'guzar'?", stage: "dpd_30", startTime: "10:50", labels: [], needsListen: true, turns: [
    open("Vikas Patel"), c("Abhi nahi ho payega, papa gujar gaye kal.", 0.43),
    a("Theek hai, jab woh wapas aayein tab baat kar lenge. Lekin aapki EMI ₹5,600 aaj due hai."),
    c("Haan theek hai.", 0.9)] }),
  base({ id: "C10", title: "No recording or identity disclosure", stage: "pre_due", startTime: "14:00", labels: ["R5", "R6"], turns: [
    a("Hello, Amit ji? Aapki EMI 7 tareekh ko due hai, yaad dilane ke liye call kiya."), c("Haan pata hai, kar dunga.", 0.94),
    a("Theek hai, dhanyavaad.")] }),
  base({ id: "C11", title: "Sister's wedding, agent pushes on", stage: "dpd_30", startTime: "12:10", labels: ["R2"], turns: [
    open("Arjun Mehta"), c("Is hafte ghar mein behen ki shaadi hai, agle hafte baat karte hain.", 0.91),
    a("Badhai ho! Lekin overdue amount ₹2,750 aaj hi clear karna zaroori hai.")] }),
  base({ id: "C12", title: "Legal-stage account, legal facts stated", stage: "legal", startTime: "11:30", labels: [], turns: [
    open("Naveen Kumar"), c("Haan bolo.", 0.93),
    a("Aapke account par legal notice pehle hi bheja ja chuka hai aur case abhi court mein hai. Kya aap settlement ke options par baat karna chahenge?"),
    c("Haan, settlement ke baare mein batao.", 0.9),
    a("Aapke liye ek one-time settlement offer hai, main details SMS kar rahi hoon.")] }),
  base({ id: "C13", title: "'Your CIBIL will go to zero'", stage: "dpd_30", startTime: "17:05", labels: ["R7"], turns: [
    open("Sneha Joshi"), c("Haan, bataiye.", 0.92),
    a("Agar aaj payment nahi kiya to aapka CIBIL zero ho jayega aur koi bank kabhi loan nahi dega."),
    c("Main kal tak kar dungi.", 0.9)] }),
  base({ id: "C14", title: "Asks to stop calling", stage: "dpd_30", startTime: "13:15", labels: ["R10"], turns: [
    open("Faizal Ahmed"), c("Din mein teen baar call aata hai, call mat karo, main khud branch aa jaunga.", 0.9),
    a("Samajh gayi. Main kal subah phir call karungi taaki payment confirm ho sake.")] }),
  base({ id: "C15", title: "Fourth attempt today", stage: "dpd_30", startTime: "18:10", attemptsToday: 3, labels: ["R4"], turns: [
    open("Lakshmi Iyer"), c("Haan.", 0.9), a("Aapki EMI ₹3,000 overdue hai, kya aaj payment ho payega?"), c("Shaam tak kar dungi.", 0.9)] }),
  base({ id: "C16", title: "Insults the borrower", stage: "dpd_90", startTime: "15:45", labels: ["R8"], turns: [
    open("Rohit Das"), c("Abhi paise nahi hain.", 0.9),
    a("Aap jaise logon ko sharam nahi aati, loan le lete ho aur bhar nahi sakte."), c("Phone rakho.", 0.9)] }),
  base({ id: "C17", title: "Hard case: shaming without the usual words", stage: "dpd_90", startTime: "16:00", labels: ["R7"], turns: [
    open("Ajay Malhotra"), c("Agle mahine dekhte hain.", 0.9),
    a("Sochiye, agar aapke rishtedaaron ko yeh baat maloom hui to aapko kaisa lagega?"), c("Yeh dhamki hai kya?", 0.9)] }),
  base({ id: "C18", title: "Hindi script call, done right", stage: "pre_due", startTime: "10:30", labels: [], turns: [
    a("नमस्ते, मैं Sahyog Finance की AI assistant मीरा बोल रही हूँ। यह कॉल रिकॉर्ड की जा रही है। क्या मैं सीमा देवी जी से बात कर रही हूँ?"),
    c("हाँ, बोलिए।", 0.92), a("आपकी किश्त ₹2,100 की 10 तारीख को है। क्या आप समय पर भुगतान कर पाएँगी?"),
    c("हाँ, कर दूँगी।", 0.9), a("धन्यवाद, आपका दिन शुभ हो।")] }),
  base({ id: "C19", title: "Hard case: 'complaint' that isn't a dispute", stage: "dpd_30", startTime: "14:30", labels: [], turns: [
    open("Priya Menon"), c("Mera phone chori ho gaya tha, police complaint ki hai, isliye miss ho gaya.", 0.9),
    a("Oh, yeh sunkar bura laga. Kya aap EMI ki date aage badhwana chahengi?"), c("Haan, 20 tareekh kar dijiye.", 0.9),
    a("Ho gaya, 20 tareekh note kar li hai.")] }),
];
