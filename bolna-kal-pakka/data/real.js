// Adi's own test calls on Bolna (Oct 2026), pulled from the execution log. He played the customer.
// Labels are hand-assigned by reading each transcript; Bolna's own interruption stats are kept for the voice-side check.
module.exports = [
{ id: "r01", split: "real", vertical: "subscription recovery (Asha, final)", execution: "5afef931-fdb6-4b5d-8370-0c142c3fbbdf", fail: ["Q3", "Q7"],
  stats: { user_interrupted_agent: 0, longest_agent_monologue_ms: 999 }, t:
`assistant: Hello, this is Asha calling from StreamNest. Am I speaking with Rohan Mehta?
user:  hello
assistant:  Are you Rohan Mehta?
user:  yes speaking
assistant:  For security, could you please confirm your year of birth?
user:  nineteen ninety four
assistant:  Thank you, Rohan. Your StreamNest Premium monthly payment of four hundred ninety-nine rupees, due on 1st October, did not go through. The bank said there was not enough balance at that moment. Would you like me to send you a secure payment link now to pay?
user:  yeah sure please
assistant: One moment, I'm sending the secure link.
assistant:  I've sent a secure Razorpay link to your phone by SMS. You can pay by UPI, card, or net banking. Is there anything else I can help you with today?
user:  not at the moment
assistant: Alright.
assistant: Thank you for your time, Rohan. Have a great day and goodbye!
user: चलो ठीक है।
assistant: ठीक है, मैं हिंदी में बात करती हूँ।
assistant: धन्यवाद, रोहन। आपका दिन शुभ हो, अलविदा!
user:  ok ma'am
assistant: अगर आपको आगे कभी मदद चाहिए हो तो बेझिझक कॉल करें। धन्यवाद!` },
{ id: "r02", split: "real", vertical: "subscription recovery (Asha v3)", execution: "56859ed5-a2e1-4d59-a631-c29e04432be5", fail: ["Q3", "Q5"],
  stats: { user_interrupted_agent: 1, longest_agent_monologue_ms: 1201 }, t:
`assistant: नमस्ते, मैं आशा बोल रही हूँ FitPulse से। क्या मेरी बात Vikram Singh जी से हो रही है?
user:  हां जी
assistant:  सुरक्षा के लिए, क्या आप अपना जन्म वर्ष बता सकते हैं?
user:  nineteen eighty five
assistant: Thank you, one moment.
assistant: आपके FitPulse Platinum membership ( monthly) का दो हज़ार चार सौ निन्यानवे रुपये का भुगतान, जो 1 अक्टूबर को था, वह पूरा नहीं हो पाया। आपके बैंक के सिस्टम में तकनीकी समस्या आ गई थी, यह आपकी गलती नहीं थी।
user:  अच्छा अच्छा
user:  ठीक है तो मुझे कुछ करने की ज़रूरत है
assistant:  नहीं, आपको अभी कुछ करने की ज़रूरत नहीं है। हमारा सिस्टम अगले 24 घंटे में अपने आप फिर से भुगतान करने की कोशिश करेगा। मैंने इस बारे में नोट भी कर दिया है।
user:  ठीक है
assistant: Alright.
assistant: आपका समय देने के लिए धन्यवाद, आपका दिन शुभ हो। नमस्ते!` },
{ id: "r03", split: "real", vertical: "merchant problem intake (Samjho v1)", execution: "da505985-66bc-4e05-9488-b0e9d7c1e2f7", fail: ["Q1", "Q2", "Q4", "Q5", "Q6", "Q8"],
  stats: { user_interrupted_agent: 9, longest_agent_monologue_ms: 4458 }, t:
`assistant: Namaste! Main Samjho hoon. Aapki dukaan ki ek roz ki problem ko samajhne ke liye main kuch sawaal poochungi, aur sab save hota rahega. Shuru karein?
user: शुरू करते हैं। करते हैं।
assistant: Ek second.
assistant:  Namaste! Main Samjho hoon. Aapki problem ko ek clear brief mein badalne mein madad karungi. Lagbhag 5 minute, 8 sawaal. Aap kabhi bhi ruk sakte hain, sab save hota rahega. Pehla sawaal: Aapke kaam mein kaunsa roz ka kaam ya problem hai jo aap theek karna chahte hain? Aur aapka business kya hai, yeh kaam kaun karta hai?
user: मेरी किराना की दुकान है।
assistant: Hmm, ek second.
assistant:  Accha, aapki kirana ki dukaan hai. Dukaan mein roz ka kaunsa kaam ya problem hai jo aap theek karna chahte hain?
user: रोज रात का दुकान बंद करके साउंडबॉक्स और कैश का हिसाब नोटबुक में मिलाता हूं।
assistant: Hmm, ek second.
assistant:  Samjha, roz raat ko saundbox aur cash notebook se milate hain. Yeh hisaab milaane ka kaam aap khud karte hain ya koi aur staff karta hai?
user: नहीं मैं नहीं करता। करतो।
assistant:  Aapke hisaab se, jo yeh kaam karta hai, usse isme sabse zyada dikkat kya hoti hai?
user: हर रोज़ दो घंटे चले जाते हैं इस हिसाब से।
assistant: Hmm, ek second.
assistant:   Samajh gaya, roz do ghante hisaab milane mein chale jaate hain. Kuch baatein aap pehle hi bata chuke hain, toh aage badhte hain. Pichli baar jab yeh hua tha, step by step bataiye, kya hua tha?
user: मुझे लगता है मेरा स्टाफ रात यू गलत है।
user: में एंट्री करते हैं।
assistant:  Aapke hisaab se, staff ki galti se kya dikkat hoti hai?
user: मतलब कि हिसाब ही पूरा गलत हो जाता है ना।
assistant: Hmm, ek second.
assistant:   Samjha, hisaab pura galat ho jata hai. Pichli baar hisaab galat hua tha, us din kitna farak tha aur kya hua tha?
user: दो हज़ार का फ़र्क था पिछले संडे।
assistant:  Aapke hisaab se, us do hazaar ke farak ki wajah kya thi?
user: कि मैं स्टाफ ने गलती कर दी।
assistant: Hmm, ek second.
assistant:   Aapko lagta hai staff ki galti se hisaab galat hua. Us din staff ne exactly kya galti ki thi, kaunsa step galat hua tha?
user: आई थिंक वो तो मेरे को नहीं पता।
user: नॉट श्योर अबाउट दैट। हज़ार।
user: स्टाफ का नाम राजू था।
assistant: Aapko pata nahi ki
user: उसमें।
assistant: Hmm, ek second.
assistant:   Samajh gaya, hazaar ka farak tha aur Raju staff mein the. Kuch baatein aap pehle hi bata chuke hain, toh aage badhte hain. Abhi aap ise kaise handle karte hain? Notebook, WhatsApp, Excel, Paytm app, ya kuch aur?
user: नोटबुक से करता मैं तो हिसाब।
assistant:  Aap notebook se hisaab karte hain. Aapko lagta hai ki notebook se kaam karne mein sabse badi dikkat kya hai?
user: यही है कि मतलब ऐसी गलतियां हो सकती है, राइट?
assistant: Hmm, ek second.
assistant:   Samajh gaya, galti hone ki possibility rehti hai. Abhi hisaab aap kaise karte hain, notebook mein likhte hain ya Excel ya kisi app mein?
user: नोटबुक में लिखता।
assistant:  Aap notebook mein likhte hain. Jab galti ho jati hai, toh usko sudharne ka kya tareeka hai?
user: अगर गलती हो गई तो फिर।
assistant: Aap bataiye,
user: उस बंदे को मैं फायर कर देता।
assistant: Hmm, ek second.
assistant:   Samajh gaya, staff ki galti pe aap use nikaal dete. Abhi roz ka hisaab kaise match karte hain, notebook mein likhkar ya kisi app se?
assistant: Kya aap abhi bhi line par hain?
user: आहा।
assistant:  Maaf kijiye, main aapka jawab samajh nahi paaya. Kya aap thoda aur bata sakte hain ki aap roz ka hisaab kaise match karte hain?
user: मैं रोज़ रात।
assistant: Aap bataiye, aap roz
user: रात को दुकान बंद करके साउंडबॉक्स और कैश।
assistant:  Aap bataiye, aap raat ko soundbox aur cash ka hisaab kaise milate hain?
user: नोटबुक में मिलाता हूँ।
assistant:   Samjha, aap notebook mein soundbox aur cash ka hisaab milate hain. Kya isme koi dikkat ya problem hoti hai?
user: यही दिक्कत है कि गलत एंट्रीज हो जाती है और फिर स्टाफ को
user: स्टाफ को फायर कर।
assistant:  Samjha, galat entry hone ki wajah se aapko staff ko nikaalna padta hai. Agla sawaal: Aap chahte hain ki yeh problem kaise solve ho?
user: पता नहीं।
assistant: Hmm, ek second.
assistant:   Koi baat nahi, main ise gap mark kar deti hoon. Kya aapne pehle kuch try kiya hai ise theek karne ke liye? Kya hua?
user: और।
assistant:   Maaf kijiye, main aapka jawab samajh nahi paayi. Kya aap thoda aur bata sakte hain?
user: नहीं।
assistant: Hmm, ek second.
assistant:   Samajh gaya, aapne pehle kuch try nahi kiya. Koi limitation hai? Jaise budget, sirf phone, language, ya staff?
user: हाँ। हाँ स्टाफ।
user: बहुत इनकम्पिटेंट है।
assistant:  Samajh gaya, staff bahut incompetent hai. Agla sawaal: Agar aapke paas ek aisa system ho jo staff ki galtiyon ko kam kar de, toh aap usse kaise istemal karna chahenge?
user: एंट्रीज मैच करने में नोटबुक।
assistant:   Samjha, aap chahte hain ki entries notebook mein match ho jayein. Agla sawaal: Aapke hisaab se, aapke business mein sabse important cheez kya hai jo is system mein honi chahiye?
user: आई थिंक सबसे इम्पोर्टेन्ट चीज़।
assistant: Ji, aap
user: होनी चाहिए कि ये नोटबुक हटा। स्टॉक है। फिर कुछ।
assistant: Samajh gaya, aap chahte
user: नोटबुक हटा के कोई और रास्ता।
assistant:  Samajh gaya, aap chahte hain ki notebook hata ke koi aur tareeka ho. Agla sawaal: Aapke liye sabse aasan tareeka kya hoga, jisse aap roz ka hisaab asaani se kar saken?
user: पता नहीं।
assistant:  Koi baat nahi, main ise gap mark kar deti hoon. Agla sawaal: Aapke hisaab se, aapke business mein sabse bada challenge kya hai jo roz face karte hain?` },
];
