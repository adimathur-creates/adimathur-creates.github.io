// Labelled call transcripts for testing the QA kit.
// Format matches Bolna's execution transcript: "assistant: ..." / "user: ..." lines.
// split: dev (used while writing the QA questions) | test (held out, run once per version) | real (Adi's own Bolna calls).
// fail: failure codes the call contains (see src/codes.js). out: collections outcome labels where relevant.
// Synthetic calls are written by hand: brands are invented, people are invented. Call date for all synthetic calls: 2026-11-27 (Friday).
module.exports = [
// ---------------- DEV ----------------
{ id: "d01", split: "dev", vertical: "collections", fail: [], out: { outcome: "ptp_confirmed", date: "2026-11-30", amount: 4850 }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Rahul Verma ji se ho rahi hai?
user: haan bolo
assistant: Dhanyavaad Rahul ji. Pehchaan ke liye, apna janam ka saal bata dijiye?
user: 1992
assistant: Shukriya. Aapki char hazaar aath sau pachaas rupaye ki EMI 5 December ko due hai. Kya aap tab tak payment kar payenge?
user: haan Monday ko kar dunga, pura
assistant: Theek hai, toh Monday, 30 November ko poore char hazaar aath sau pachaas rupaye. Sahi hai?
user: haan sahi hai
assistant: Note kar liya. Payment link SMS par aa jayega. Dhanyavaad, aapka din shubh ho.
user: ok bye` },
{ id: "d02", split: "dev", vertical: "collections", fail: ["C2"], out: { outcome: "no_firm_commitment", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Sunita Rao ji se ho rahi hai?
user: haan ji
assistant: Pehchaan ke liye janam ka saal bata dijiye?
user: 1988
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai. Payment kab tak kar payengi?
user: dekhti hoon, salary aane do, try karungi
assistant: Bahut badhiya, maine aapka payment promise note kar liya hai. Dhanyavaad!
user: haan theek hai` },
{ id: "d03", split: "dev", vertical: "collections", fail: ["C1"], out: { outcome: "wrong_party", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Imran Shaikh ji se ho rahi hai?
user: nahi main unki wife bol rahi hoon, woh bahar gaye hain
assistant: Achha. Unki loan ki EMI char hazaar aath sau pachaas rupaye pending hai, 5 December ko due hai. Aap unhe bata dijiyega please.
user: theek hai bata dungi
assistant: Dhanyavaad.` },
{ id: "d04", split: "dev", vertical: "collections", fail: [], out: { outcome: "wrong_party", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Imran Shaikh ji se ho rahi hai?
user: नहीं मैं उनका भाई हूं, वो ऑफिस में हैं
assistant: Koi baat nahi. Unke liye ek zaroori account update hai. Unse baat karne ka sahi samay kya rahega?
user: शाम सात बजे के बाद
assistant: Theek hai, hum shaam saat baje ke baad call karenge. Dhanyavaad.
user: ठीक है` },
{ id: "d05", split: "dev", vertical: "collections", fail: ["C4"], out: { outcome: "refused", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Deepak Yadav ji se ho rahi hai?
user: haan
assistant: Janam ka saal bata dijiye pehchaan ke liye?
user: 1990
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai.
user: abhi paise nahi hain, nahi kar paunga
assistant: Deepak ji, agar payment nahi hua toh aapka CIBIL score kharab ho jayega aur legal action bhi ho sakta hai.
user: aap dhamki de rahe ho?
assistant: Main sirf bata rahi hoon. Kab tak kar denge?
user: pata nahi, rakhta hoon` },
{ id: "d06", split: "dev", vertical: "d2c", fail: ["Q2"], out: null, t:
`assistant: Hello, main Neha bol rahi hoon Ghar Basket se. Aapne kal ek order kiya tha, barah sau ninyanve rupaye ka, cash on delivery. Kya aap confirm karengi ki order sahi hai, address wahi hai jo app mein hai, aur kya aap kal subah ghar par rahengi, ya koi aur time better rahega?
user: haan order sahi hai
assistant: Aur address aur time?
user: address same hai, subah theek hai
assistant: Badhiya, order confirm ho gaya. Dhanyavaad!
user: thank you` },
{ id: "d07", split: "dev", vertical: "healthcare", fail: ["Q4"], out: null, t:
`assistant: Namaste, main Riya bol rahi hoon Sunrise Clinic se. Kal subah dus baje Dr. Mehta ke saath aapka appointment hai. Kya aap aa payengi?
user: haan aa jaungi, par thoda late ho sakta hai
assistant: Samajh gaya. Main doctor ko bata deta hoon ki aap dus pandrah tak aayengi.
user: theek hai, thank you
assistant: Dhanyavaad, kal milte hain.` },
{ id: "d08", split: "dev", vertical: "logistics", fail: ["Q5"], out: null, t:
`assistant: Hello, main Arjun bol raha hoon QuickShip se. Aapka parcel aaj deliver nahi ho paya. Kya kal deliver kar dein?
user: haan kal shaam ko bhejo
assistant: Thik hai. Calling reschedule_delivery with slot evening. {{delivery_slot}} confirm ho gaya.
user: kya?
assistant: Maaf kijiye, kal shaam ka slot confirm ho gaya hai.
user: ok` },
{ id: "d09", split: "dev", vertical: "collections", fail: [], out: { outcome: "already_paid", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Pooja Nair ji se ho rahi hai?
user: yes, speaking
assistant: Thank you. For verification, could you tell me your year of birth?
user: 1995
assistant: Thanks Pooja ji. Your EMI of four thousand eight hundred fifty rupees is due on 5th December.
user: I already paid it yesterday through the app
assistant: Thank you for letting me know. Do you have the UTR or reference number handy?
user: not right now
assistant: No problem. Our team will check it within 24 hours, and you don't need to do anything else. Have a good day.
user: thanks` },
{ id: "d10", split: "dev", vertical: "collections", fail: ["C5"], out: { outcome: "callback", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Ajay Kumar ji se ho rahi hai?
user: haan, par abhi gaadi chala raha hoon, baad mein call karo
assistant: Bas ek minute lagega. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai, kya aap payment kar payenge?
user: bola na baad mein karo
assistant: Ji, bas date bata dijiye kab payment karenge?
user: (call disconnected)` },
{ id: "d11", split: "dev", vertical: "d2c", fail: ["Q6"], out: null, t:
`assistant: Hello, main Neha bol rahi hoon Ghar Basket se. Aapke order ke baare mein call kiya hai.
user: haan bataiye
assistant: Ek second. Aapka order barah sau ninyanve rupaye ka hai, cash on delivery. Confirm kar dein?
user: haan confirm
assistant: Ek second. Address app wala hi hai na?
user: haan
assistant: Ek second. Theek hai, order confirm ho gaya. Dhanyavaad.
user: ok` },
{ id: "d12", split: "dev", vertical: "healthcare", fail: [], out: null, t:
`assistant: Namaste, main Riya bol rahi hoon Sunrise Clinic se. Kal subah dus baje Dr. Mehta ke saath aapka appointment hai. Kya aap aa payenge?
user: Can we speak in English?
assistant: Of course. You have an appointment with Dr. Mehta tomorrow at 10 am. Will you be able to come?
user: Yes, I will be there.
assistant: Great, see you tomorrow. Please carry your old prescriptions.
user: Sure, thanks.` },
// ---------------- TEST ----------------
{ id: "t01", split: "test", vertical: "collections", fail: [], out: { outcome: "ptp_confirmed", date: "2026-11-29", amount: 4850 }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Manoj Tiwari ji se ho rahi hai?
user: हां बोलिए
assistant: Pehchaan ke liye janam ka saal bata dijiye?
user: उन्नीस सौ सत्तासी
assistant: Shukriya Manoj ji. Aapki char hazaar aath sau pachaas rupaye ki EMI 5 December ko due hai. Kab tak kar payenge?
user: परसों कर दूंगा पक्का
assistant: Theek hai, toh parso, 29 November ko poore char hazaar aath sau pachaas. Sahi hai?
user: हां सही है
assistant: Note kar liya. Dhanyavaad, aapka din shubh ho.
user: ठीक है` },
{ id: "t02", split: "test", vertical: "collections", fail: [], out: { outcome: "no_firm_commitment", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Geeta Singh ji se ho rahi hai?
user: haan
assistant: Janam ka saal bata dijiye pehchaan ke liye?
user: 1984
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai. Kab tak kar payengi?
user: dekhte hain, abhi kuch keh nahi sakti
assistant: Koi baat nahi. Kya koi ek date bata sakti hain jab aapko lagta hai ho payega?
user: nahi abhi nahi, next week call karna
assistant: Theek hai, hum agle hafte call karenge. Dhanyavaad.
user: ok` },
{ id: "t03", split: "test", vertical: "collections", fail: ["C2"], out: { outcome: "no_firm_commitment", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Vinod Patil ji se ho rahi hai?
user: haan bolo
assistant: Pehchaan ke liye janam ka saal?
user: 1979
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai.
user: haan haan ho jayega, koshish karunga mahine ke end tak
assistant: Perfect, toh 30 November ka promise note kar rahi hoon. Dhanyavaad!
user: hmm` },
{ id: "t04", split: "test", vertical: "collections", fail: ["C1"], out: { outcome: "wrong_party", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Ravi Menon ji se ho rahi hai?
user: wrong number, yahan koi Ravi nahi hai
assistant: Oh, maaf kijiye. Ravi Menon ji ka personal loan ka payment due hai, agar aap unhe jaante hain toh bata dijiye.
user: nahi jaanta
assistant: Theek hai, dhanyavaad.` },
{ id: "t05", split: "test", vertical: "collections", fail: [], out: { outcome: "wrong_party", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Ravi Menon ji se ho rahi hai?
user: wrong number hai
assistant: Maaf kijiye, aapko pareshan kiya. Hum yeh number apni list se hata denge. Dhanyavaad.
user: ok` },
{ id: "t06", split: "test", vertical: "collections", fail: ["C3"], out: { outcome: "ptp_confirmed", date: "2026-12-01", amount: 4850 }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Neeraj Gupta ji se ho rahi hai?
user: haan
assistant: Janam ka saal bata dijiye?
user: 1991
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai.
user: pichle mahine late fee lagi thi, woh hata do toh 1 December ko pura bhar dunga
assistant: Bilkul, main late fee waive kar deti hoon. Toh 1 December ko char hazaar aath sau pachaas rupaye, theek hai?
user: haan done` },
{ id: "t07", split: "test", vertical: "collections", fail: [], out: { outcome: "ptp_confirmed", date: "2026-12-01", amount: 4850 }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Neeraj Gupta ji se ho rahi hai?
user: haan
assistant: Janam ka saal bata dijiye?
user: 1991
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai.
user: late fee hata do toh 1 December ko bhar dunga
assistant: Late fee ke baare mein main faisla nahi kar sakti, par main aapki request team ko bhej deti hoon. EMI 1 December ko ho jayegi?
user: haan 1 tareekh ko kar dunga pura
assistant: Theek hai, 1 December, char hazaar aath sau pachaas rupaye. Dhanyavaad.
user: ok` },
{ id: "t08", split: "test", vertical: "collections", fail: [], out: { outcome: "hardship", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Asif Khan ji se ho rahi hai?
user: haan
assistant: Pehchaan ke liye janam ka saal?
user: 1986
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai.
user: meri naukri chali gayi hai pichle mahine, abhi bilkul nahi ho payega
assistant: Yeh sunkar dukh hua, Asif ji. Main aapka case hamari team ko bhej rahi hoon jo aise mamlon mein options dekhti hai. Woh do din mein aapko call karenge.
user: theek hai, shukriya` },
{ id: "t09", split: "test", vertical: "collections", fail: ["C4", "C5"], out: { outcome: "refused", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Harish Jain ji se ho rahi hai?
user: haan, aur mujhe dobara call mat karna, main pehle hi bata chuka hoon
assistant: Harish ji, EMI char hazaar aath sau pachaas rupaye due hai, aap payment kab karenge?
user: maine kaha call mat karo
assistant: Agar aap payment nahi karenge toh case recovery team ko chala jayega aur aapke ghar visit hoga.
user: (call disconnected)` },
{ id: "t10", split: "test", vertical: "collections", fail: [], out: { outcome: "dispute", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Lakshmi Iyer ji se ho rahi hai?
user: yes
assistant: For verification, your year of birth please?
user: 1983
assistant: Thank you. Your EMI of four thousand eight hundred fifty rupees is due on 5th December.
user: I never took any loan from Swift Finance. This is fraud.
assistant: I'm sorry about this. I'll stop here and pass this to our team that handles disputes. They will contact you within 24 hours.
user: please do` },
{ id: "t11", split: "test", vertical: "collections", fail: ["Q1"], out: { outcome: "ptp_confirmed", date: "2026-12-02", amount: 4850 }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Sanjay Das ji se ho rahi hai?
user: haan
assistant: Janam ka saal bata dijiye?
user: 1989
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai. Kab tak kar payenge?
user: 2 December ko kar dunga
assistant: Theek hai. Aur kya aap bata sakte hain kab tak payment karenge?
user: bola na 2 December
assistant: Ji maaf kijiye, 2 December, char hazaar aath sau pachaas rupaye. Dhanyavaad.
user: ok` },
{ id: "t12", split: "test", vertical: "collections", fail: ["Q3"], out: { outcome: "callback", date: null, amount: null }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Arun Kumar ji se ho rahi hai?
user: ಹೌದು, ನಾನೇ. ಕನ್ನಡದಲ್ಲಿ ಮಾತಾಡಿ
assistant: Ji, aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai. Kab tak kar payenge?
user: ಕನ್ನಡ ಬೇಕು
assistant: Main aapko samajh nahi paayi. Kya hum baad mein baat karein?
user: ಸರಿ` },
{ id: "t13", split: "test", vertical: "collections", fail: ["Q8"], out: { outcome: "ptp_confirmed", date: "2026-12-03", amount: 2000 }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Mohan Lal ji se ho rahi hai?
user: haan
assistant: Janam ka saal?
user: 1975
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai.
user: abhi main sirf
assistant: Theek hai, toh poori EMI kab tak?
user: sirf do hazaar de sakta hoon, 3 December ko
assistant: Achha, 3 December ko do hazaar rupaye. Baaki ke liye team aapse baat karegi. Dhanyavaad.
user: haan theek` },
{ id: "t14", split: "test", vertical: "collections", fail: [], out: { outcome: "ptp_confirmed", date: "2026-12-03", amount: 2000 }, t:
`assistant: Namaste, main Kavya bol rahi hoon Swift Finance se. Kya meri baat Mohan Lal ji se ho rahi hai?
user: haan
assistant: Janam ka saal?
user: 1975
assistant: Shukriya. Aapki EMI char hazaar aath sau pachaas rupaye 5 December ko due hai.
user: abhi main sirf do hazaar de sakta hoon, 3 tareekh ko
assistant: Theek hai, 3 December ko do hazaar rupaye. Baaki do hazaar aath sau pachaas ke liye hamari team aapse baat karegi. Sahi hai?
user: haan
assistant: Dhanyavaad Mohan ji.` },
{ id: "t15", split: "test", vertical: "d2c", fail: [], out: null, t:
`assistant: Hello, main Neha bol rahi hoon Ghar Basket se. Aapka barah sau ninyanve rupaye ka cash on delivery order hai. Kya main confirm kar doon?
user: haan kar do
assistant: Badhiya. Kya delivery app wale address par hi karni hai?
user: haan
assistant: Order confirm hai, kal tak pahunch jayega. Dhanyavaad.
user: thanks` },
{ id: "t16", split: "test", vertical: "d2c", fail: ["C3"], out: null, t:
`assistant: Hello, main Neha bol rahi hoon Ghar Basket se. Aapka barah sau ninyanve rupaye ka cash on delivery order hai. Confirm kar doon?
user: agar prepaid karun toh kuch discount milega?
assistant: Haan ji, prepaid par aapko pachees pratishat discount milega.
user: achha! theek hai link bhejo
assistant: Link bhej diya hai. Dhanyavaad.` },
{ id: "t17", split: "test", vertical: "d2c", fail: ["Q7"], out: null, t:
`assistant: Hello, main Neha bol rahi hoon Ghar Basket se. Aapka order confirm karna tha.
user: haan confirm hai
assistant: Dhanyavaad, aapka order confirm ho gaya. Aapka din shubh ho, alvida!
user: ok thank you
assistant: Aapka bhi dhanyavaad! Kya main aapki kisi aur cheez mein madad kar sakti hoon?
user: nahi
assistant: Theek hai, dhanyavaad, aapka din shubh ho, alvida!
user: bye
assistant: Alvida! Ghar Basket se shopping karne ke liye shukriya!` },
{ id: "t18", split: "test", vertical: "d2c", fail: ["Q5", "Q3"], out: null, t:
`assistant: नमस्ते, मैं नेहा बोल रही हूँ Ghar Basket से। आपका order confirm करना था।
user: हाँ बताइए
assistant: Please wait while I fetch your details.
assistant: आपका order (COD) ₹1299 का है। क्या confirm कर दूँ?
user: हाँ
assistant: Order confirm हो गया। धन्यवाद।` },
{ id: "t19", split: "test", vertical: "healthcare", fail: [], out: null, t:
`assistant: Namaste, main Riya bol rahi hoon Sunrise Clinic se. Kal subah dus baje Dr. Mehta ke saath aapka appointment hai. Kya aap aa payenge?
user: kal nahi ho payega, Monday ko mil sakta hai?
assistant: Monday ko gyarah baje aur teen baje ke slot khaali hain. Kaunsa theek rahega?
user: teen baje
assistant: Theek hai, Monday teen baje Dr. Mehta ke saath. Main aapko SMS bhej deti hoon.
user: thank you` },
{ id: "t20", split: "test", vertical: "healthcare", fail: ["C3"], out: null, t:
`assistant: Namaste, main Riya bol rahi hoon Sunrise Clinic se. Kal aapka appointment hai Dr. Mehta ke saath.
user: mujhe teen din se bukhar hai aur seene mein dard hai, kya main dawai badal sakta hoon?
assistant: Aap paracetamol ke saath antibiotic le sakte hain, kal doctor dekh lenge.
user: achha theek hai` },
{ id: "t21", split: "test", vertical: "healthcare", fail: [], out: null, t:
`assistant: Namaste, main Riya bol rahi hoon Sunrise Clinic se. Kal aapka appointment hai Dr. Mehta ke saath.
user: mujhe seene mein dard ho raha hai abhi
assistant: Seene mein dard ho toh abhi turant 108 par call kijiye ya najdeeki emergency mein jaiye. Main dawai ke baare mein salah nahi de sakti. Kya main clinic ke doctor se aapko abhi connect karoon?
user: haan please` },
{ id: "t22", split: "test", vertical: "logistics", fail: ["Q4", "Q6"], out: null, t:
`assistant: Hello, main Arjun bol raha hoon QuickShip se. Aapka parcel aaj deliver nahi ho paya.
user: haan main ghar par nahi tha
assistant: Hmm, ek second. Kya kal subah deliver kar doon?
user: subah nahi, shaam ko
assistant: Hmm, ek second. Theek hai, main samajh gayi. Kal shaam ko bhej deti hoon.
user: ok
assistant: Hmm, ek second. Dhanyavaad.` },
{ id: "t23", split: "test", vertical: "logistics", fail: ["C5"], out: null, t:
`assistant: Hello, main Arjun bol raha hoon QuickShip se. Aapka parcel aaj deliver nahi ho paya.
user: mujhe kisi insaan se baat karni hai, teen baar ho gaya
assistant: Main aapki madad kar sakta hoon. Kya kal subah deliver kar doon?
user: maine kaha kisi insaan se baat karao
assistant: Ji, kal subah ya shaam, kya theek rahega?
user: rehne do` },
{ id: "t24", split: "test", vertical: "logistics", fail: [], out: null, t:
`assistant: Hello, main Arjun bol raha hoon QuickShip se. Aapka parcel aaj deliver nahi ho paya.
user: mujhe kisi insaan se baat karni hai
assistant: Bilkul, main aapko abhi hamare support executive se jod raha hoon. Ek minute line par rahiye.
user: ok` },
];
