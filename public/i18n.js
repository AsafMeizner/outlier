// English / Hebrew. Keys are the English text; `key|one` is the singular form used when n === 1.
const EN = {
  tier1: 'Mainstream', tier2: 'Familiar', tier3: 'Uncommon', tier4: 'Rare', tier5: 'Outlier',
  where1: 'Bonks into the water cooler', where2: 'Lands on a car in the parking lot', where3: 'Lands on a café awning in town',
  where4: 'Splashes into the sea', where5: 'Lands on the Moon',
  '{n} colleagues said this too.|one': '1 colleague said this too.',
  '{n} colleagues said the same.|one': '1 colleague said the same.',
  '{n} players finished this day. Answers are listed from most to least given.|one': '1 player finished this day. Answers are listed from most to least given.',
  '{n} prompts, {s} seconds each|one': '1 prompt, {s} seconds',
  'Every day there is a new set of {n} prompts. Each one names a category, like “Name a planet”. You get {s} seconds per prompt to type one answer that fits.|one':
    'Every day there is a new prompt that names a category, like “Name a planet”. You get {s} seconds to type one answer that fits.',
};

const HE = {
  tier1: 'צפוי', tier2: 'מוכר', tier3: 'לא שגרתי', tier4: 'נדיר', tier5: 'חריג',
  where1: 'נתקע בקולר', where2: 'נוחת על אוטו בחניון', where3: 'נוחת על סוכך של בית קפה', where4: 'נוחת בים', where5: 'נוחת על הירח',
  Missed: 'פספוס', '{n} m': '{n} מ׳', '{n}s': '{n} שנ׳', '{h}h {m}m': '{h} שע׳ {m} דק׳',
  'Server error ({n})': 'שגיאת שרת ({n})', 'Request failed': 'הבקשה נכשלה',
  'Switch language': 'החלפת שפה', Sound: 'צליל', Main: 'ראשי',
  Today: 'היום', Leaderboard: 'טבלת מובילים', Archive: 'ארכיון', 'My stats': 'הנתונים שלי', 'How to play': 'איך משחקים', Admin: 'ניהול', 'Sign out': 'יציאה',
  'Find the answer nobody else will.': 'מצאו את התשובה שאף אחד אחר לא יחשוב עליה.',
  Username: 'שם משתמש', Password: 'סיסמה', 'Sign in': 'כניסה', 'Create an account': 'יצירת חשבון', 'Ask an admin for an account.': 'בקשו חשבון ממנהל.',
  '2-32 letters, numbers, dot, dash or underscore': '2-32 אותיות באנגלית, ספרות, נקודה, מקף או קו תחתון',
  'Name shown on the leaderboard': 'השם שיופיע בטבלה', 'Team or department (optional)': 'צוות או מחלקה (לא חובה)', 'Team or department': 'צוות או מחלקה',
  'Password (8+ characters)': 'סיסמה (8 תווים לפחות)', 'Invite code': 'קוד הזמנה', 'Join {name}': 'הצטרפות ל-{name}', 'Create account': 'יצירת חשבון',
  'I already have an account': 'כבר יש לי חשבון', 'First-time setup': 'הגדרה ראשונית',
  'Create the admin account. The setup code is printed in the server window.': 'צרו את חשבון המנהל. קוד ההגדרה מודפס בחלון של השרת.',
  'Setup code': 'קוד הגדרה', 'Admin username': 'שם משתמש למנהל', 'Your name': 'השם שלך', 'Create admin account': 'יצירת חשבון מנהל', 'Admin account created': 'חשבון המנהל נוצר',
  'Choose your password': 'בחרו סיסמה', 'Change password': 'שינוי סיסמה',
  'You signed in with a temporary password. Pick your own to continue.': 'נכנסתם עם סיסמה זמנית. בחרו סיסמה משלכם כדי להמשיך.',
  'Temporary password': 'סיסמה זמנית', 'Current password': 'הסיסמה הנוכחית', 'New password (8+ characters)': 'סיסמה חדשה (8 תווים לפחות)',
  'Save password': 'שמירת סיסמה', 'Password saved': 'הסיסמה נשמרה',
  'Your desk, ready for launch': 'השולחן שלך, מוכן לשיגור', 'No puzzle today. See you next time.': 'אין חידה היום. נתראה בפעם הבאה.',
  'See your results': 'לתוצאות שלך', Continue: 'המשך', Launch: 'שיגור!', 'Day {n}': 'יום {n}',
  '{n} prompts, {s} seconds each': '{n} שאלות, {s} שניות לכל אחת', '{n} prompts, {s} seconds each|one': 'שאלה אחת, {s} שניות',
  'Your distance today': 'המרחק שלך היום', 'Day streak, play to keep it': 'ימים ברצף, שחקו כדי לשמור', 'Day streak': 'ימים ברצף', 'Best streak': 'הרצף הכי ארוך',
  'Launched today': 'שוגרו היום', 'Until the next puzzle': 'עד החידה הבאה', 'Furthest today': 'הכי רחוק היום',
  'Nobody has launched yet. Be the first.': 'עוד אף אחד לא שוגר. תהיו הראשונים.', 'Full leaderboard': 'לטבלה המלאה', 'How far will you fly?': 'כמה רחוק תעופו?',
  'Each prompt names a category. Type any answer that fits. The rarer your answer, the further your chair flies.': 'כל שאלה היא קטגוריה. כתבו כל תשובה שמתאימה. ככל שהתשובה נדירה יותר, הכיסא עף רחוק יותר.',
  'Launch scene': 'סצנת השיגור', Progress: 'התקדמות', archive: 'ארכיון', live: 'בזמן אמת', 'All done': 'סיימתם', 'You flew {d} today': 'עפתם היום {d}',
  'See answers and results': 'לתשובות ולתוצאות', 'Show the first prompt': 'לשאלה הראשונה', 'Next prompt': 'לשאלה הבאה', 'Prompt {a} of {b}': 'שאלה {a} מתוך {b}',
  'The {s}-second clock starts when you press the button.': 'השעון ({s} שניות) מתחיל כשלוחצים על הכפתור.',
  'Your answer': 'התשובה שלך', 'Type an answer…': 'כתבו תשובה…', Submit: 'שליחה', Pass: 'דילוג', Passed: 'דילגתם',
  'No distance this time.': 'הפעם בלי מרחק.', '“{a}” isn’t on the list. Try another.': '"{a}" לא ברשימה. נסו משהו אחר.', 'Launching…': 'משגרים…',
  'Nobody else has said this yet.': 'עוד אף אחד לא ענה את זה.', '{n} colleagues said this too.': '{n} עמיתים ענו גם את זה.', '{n} colleagues said this too.|one': 'עמית אחד ענה גם את זה.',
  'Close enough to “{a}”.': 'מספיק קרוב ל"{a}".', "Time's up": 'נגמר הזמן', 'No distance this round.': 'בסיבוב הזה בלי מרחק.',
  'Where each of your answers landed': 'איפה נחתה כל תשובה שלך', 'Result copied': 'התוצאה הועתקה', 'Total distance': 'מרחק כולל', 'Copy result': 'העתקת התוצאה',
  '{n} players finished this day. Answers are listed from most to least given.': '{n} שחקנים סיימו את היום הזה. התשובות מסודרות מהנפוצה לנדירה.',
  '{n} players finished this day. Answers are listed from most to least given.|one': 'שחקן אחד סיים את היום הזה. התשובות מסודרות מהנפוצה לנדירה.',
  'No answer': 'בלי תשובה', 'You said “{a}”': 'עניתם "{a}"', 'accepted later by an admin': 'אושר אחר כך על ידי מנהל',
  '{n} colleagues said the same.': '{n} עמיתים ענו אותו דבר.', '{n} colleagues said the same.|one': 'עמית אחד ענה אותו דבר.', 'Nobody else did.': 'אף אחד אחר לא ענה את זה.',
  'All {n} accepted answers': 'כל {n} התשובות המתקבלות', Office: 'משרד', Parking: 'חניון', City: 'עיר', Beach: 'חוף', Sea: 'ים', Moon: 'ירח',
  'This week': 'השבוע', 'This month': 'החודש', 'All time': 'מכל הזמנים', Streaks: 'רצפים', Teams: 'צוותים', Period: 'תקופה',
  'No team scores this week. Players can set a team on their stats page.': 'אין עדיין תוצאות צוותים השבוע. אפשר לבחור צוות בדף הנתונים האישי.',
  'Nobody is on the board yet. Be the first.': 'הטבלה עוד ריקה. תהיו הראשונים.',
  Player: 'שחקן', Team: 'צוות', 'Moon landings': 'נחיתות על הירח', Time: 'זמן', Distance: 'מרחק', 'Current streak': 'רצף נוכחי', 'not yet today': 'עוד לא היום',
  Players: 'שחקנים', Games: 'משחקים', 'Average per game': 'ממוצע למשחק', Days: 'ימים', Average: 'ממוצע', Best: 'שיא', '{a} to {b}': '{a} עד {b}',
  'Puzzle days in a row, played on the day': 'ימי חידה ברצף, ששוחקו באותו יום', 'Teams are ranked by average per game, so small teams can win too.': 'הצוותים מדורגים לפי ממוצע למשחק, כך שגם צוות קטן יכול לנצח.',
  'Catch up on days you missed. Archive games show your distance but do not count for the leaderboard or streaks.': 'השלימו ימים שפספסתם. משחקי ארכיון מראים מרחק, אבל לא נספרים בטבלה וברצפים.',
  'Answers for every past day.': 'התשובות של כל הימים הקודמים.', Date: 'תאריך', Categories: 'קטגוריות', Furthest: 'הכי רחוק', You: 'אתם',
  Results: 'תוצאות', Play: 'לשחק', Answers: 'תשובות', started: 'התחלתם', 'No days yet.': 'עוד אין ימים.',
  'Your look is made from your username.': 'הדמות שלכם נבנית משם המשתמש.', 'Days played': 'ימים ששוחקו', 'Average per day': 'ממוצע ליום', 'Best day': 'היום הכי טוב',
  'Where your answers land': 'איפה התשובות שלך נוחתות', 'Missed or passed: {n}': 'פספוסים ודילוגים: {n}', 'Play a day to see where your answers land.': 'שחקו יום אחד כדי לראות איפה התשובות שלכם נוחתות.',
  History: 'היסטוריה', Rank: 'מקום', unfinished: 'לא הסתיים', '{a} of {b}': '{a} מתוך {b}', 'Nothing yet.': 'עוד אין כלום.',
  Profile: 'פרופיל', 'Save profile': 'שמירת פרופיל', 'Profile saved': 'הפרופיל נשמר', 'Signed in as {u}.': 'מחוברים בתור {u}.',
  'Every day there is a new set of {n} prompts. Each one names a category, like “Name a planet”. You get {s} seconds per prompt to type one answer that fits.':
    'בכל יום יש סט חדש של {n} שאלות. כל שאלה היא קטגוריה, למשל "שם של כוכב לכת". יש לכם {s} שניות לכל שאלה כדי לכתוב תשובה אחת שמתאימה.',
  'The twist: obvious answers barely move your chair. The rarer your answer, the further you launch out of the office.': 'הטוויסט: תשובה צפויה בקושי מזיזה את הכיסא. ככל שהתשובה נדירה יותר, אתם עפים רחוק יותר מהמשרד.',
  'If an answer is not on the list you can try another while the clock runs. Spelling slips, plurals, capitals and accents are forgiven. Pass if you are stuck.':
    'אם תשובה לא ברשימה, אפשר לנסות אחרת כל עוד השעון רץ. שגיאות כתיב קטנות, רבים/יחיד, כתיב מלא וחסר וניקוד לא משנים. תקועים? דלגו.',
  'The clock only starts when you open a prompt, so you can take a break between prompts. Your answers and everyone else’s are revealed once you finish.':
    'השעון מתחיל רק כשפותחים שאלה, אז אפשר לעשות הפסקה בין שאלות. התשובות שלכם ושל כולם נחשפות כשמסיימים.',
  'Play every puzzle day to build a streak. Missed a day? Play it from the archive; it won’t count for the leaderboard.': 'שחקו בכל יום חידה כדי לבנות רצף. פספסתם יום? שחקו אותו מהארכיון; הוא לא ייספר בטבלה.',
  'Think a valid answer was turned away? Tell an admin. If they add it, you get the distance retroactively.': 'חושבים שתשובה נכונה נדחתה? ספרו למנהל. אם יוסיף אותה, תקבלו את המרחק בדיעבד.',
  'Loading…': 'טוען…', 'Page not found': 'הדף לא נמצא', 'Back to today': 'חזרה להיום', 'That didn’t work': 'זה לא הצליח',
  // server messages
  'Wrong username or password.': 'שם משתמש או סיסמה שגויים.', 'This account is disabled.': 'החשבון הזה מושבת.',
  'Too many attempts. Wait 15 minutes or ask an admin to reset your password.': 'יותר מדי ניסיונות. חכו 15 דקות או בקשו ממנהל לאפס את הסיסמה.',
  'That username is taken': 'שם המשתמש הזה תפוס', 'Password must be at least 8 characters': 'הסיסמה צריכה להיות באורך 8 תווים לפחות',
  'Username: 2-32 letters, numbers, dot, dash or underscore': 'שם משתמש: 2-32 אותיות באנגלית, ספרות, נקודה, מקף או קו תחתון',
  'Sign-up is closed. Ask an admin for an account.': 'ההרשמה סגורה. בקשו חשבון ממנהל.', 'Wrong invite code.': 'קוד הזמנה שגוי.', 'Please sign in.': 'נא להתחבר.',
  'Current password is wrong.': 'הסיסמה הנוכחית שגויה.', 'New password must be at least 8 characters': 'הסיסמה החדשה צריכה להיות באורך 8 תווים לפחות',
  'Type an answer': 'כתבו תשובה', 'There is no puzzle today.': 'אין חידה היום.', 'That day has not started yet': 'היום הזה עוד לא התחיל',
  'Answers are revealed when you finish or when the day is over.': 'התשובות נחשפות כשמסיימים או כשהיום נגמר.',
  'Wrong setup code. It is printed in the server window.': 'קוד הגדרה שגוי. הוא מודפס בחלון של השרת.', 'Something went wrong on the server.': 'משהו השתבש בשרת.',
  'Admins only.': 'למנהלים בלבד.', 'Please choose a new password first.': 'קודם בחרו סיסמה חדשה.', 'Archive play is turned off': 'משחק מהארכיון כבוי',
  'No puzzle was played on that day.': 'לא הייתה חידה ביום הזה.', 'That is a lot of guesses for one round.': 'זה הרבה ניחושים לסיבוב אחד.',
};
Object.assign(EN, {
  '{n} prompts|one': '1 prompt', '{n} played|one': '1 played', 'Scheduled {n} days|one': 'Scheduled 1 day', '{n} answers|one': '1 answer',
  '{n} players already played this day, so it is locked.|one': '1 player already played this day, so it is locked.',
  '{n} turned-away answers are waiting for review.|one': '1 turned-away answer is waiting for review.',
  'The bank has unused prompts for about {n} days.|one': 'The bank has unused prompts for about 1 day.',
  'Saved. {n} earlier answers now scored.|one': 'Saved. 1 earlier answer now scored.', 'Added {n} answers below. Save to keep them.|one': 'Added 1 answer below. Save to keep it.',
  '{n} problems:|one': '1 problem:', 'Imported {n} new prompts|one': 'Imported 1 new prompt', 'Added. {n} rounds re-scored.|one': 'Added. 1 round re-scored.',
  'Spelling added. {n} rounds re-scored.|one': 'Spelling added. 1 round re-scored.', '{n} accounts created|one': '1 account created',
});

// Admin panel
Object.assign(HE, {
  Day: 'יום', Sun: 'א׳', Mon: 'ב׳', Tue: 'ג׳', Wed: 'ד׳', Thu: 'ה׳', Fri: 'ו׳', Sat: 'ש׳',
  never: 'אף פעם', '{n} min ago': 'לפני {n} דק׳', '{n} h ago': 'לפני {n} שע׳', '{n} d ago': 'לפני {n} ימים',
  'The bank has unused prompts for about {n} days.': 'במאגר יש שאלות שלא נוצלו לעוד כ-{n} ימים.', 'After that, the least-used prompts repeat.': 'אחרי זה יחזרו השאלות שהשתמשו בהן הכי מעט.',
  'Import more': 'ייבוא שאלות', 'Write one': 'כתיבת שאלה', '{n} turned-away answers are waiting for review.': '{n} תשובות שנדחו מחכות לבדיקה.',
  '{n} turned-away answers are waiting for review.|one': 'תשובה אחת שנדחתה מחכה לבדיקה.', 'Review them': 'לבדיקה',
  Overview: 'סקירה', 'Finished today ({n} started)': 'סיימו היום ({n} התחילו)', 'Users ({n} active this week)': 'משתמשים ({n} פעילים השבוע)',
  'Prompts in the bank': 'שאלות במאגר', 'Never used': 'לא נוצלו', 'Days scheduled ahead': 'ימים מתוזמנים מראש',
  'Today’s puzzle is created when the first player opens the game, or you can pick it in the schedule.': 'החידה של היום נוצרת כשהשחקן הראשון נכנס, או שאפשר לבחור אותה בלוח הזמנים.',
  'Open schedule': 'ללוח הזמנים', 'Players per day': 'שחקנים ליום', 'Players per day over the last two weeks': 'שחקנים ליום בשבועיים האחרונים', 'No days played yet.': 'עוד לא שיחקו אף יום.',
  '{n} prompts': '{n} שאלות', '{n} prompts|one': 'שאלה אחת', '{n} played': '{n} שיחקו', auto: 'אוטומטי', 'auto-picked': 'בחירה אוטומטית', 'no puzzle': 'בלי חידה',
  'Number of days': 'מספר ימים', Schedule: 'לוח זמנים', 'Pre-fill the next': 'למלא מראש את', days: 'הימים הבאים', 'Scheduled {n} days': 'תוזמנו {n} ימים',
  'Those days are already scheduled': 'הימים האלה כבר מתוזמנים', 'Auto-fill': 'מילוי אוטומטי',
  'Days you leave empty get picked automatically from the least-used prompts when the first player opens the game. Puzzle days and language are set in Settings.':
    'ימים שנשארים ריקים מתמלאים אוטומטית בשאלות שהשתמשו בהן הכי מעט, כשהשחקן הראשון נכנס. ימי החידה והשפה נקבעים בהגדרות.',
  'No puzzle on this day.': 'אין חידה ביום הזה.', '{n} players already played this day, so it is locked.': '{n} שחקנים כבר שיחקו ביום הזה, ולכן הוא נעול.',
  'This day is in the past.': 'היום הזה כבר עבר.', 'See answers': 'לתשובות', 'Search prompts': 'חיפוש שאלות', Category: 'קטגוריה', 'All categories': 'כל הקטגוריות',
  Language: 'שפה', 'Both languages': 'שתי השפות', 'Move up': 'למעלה', 'Move down': 'למטה', Remove: 'הסרה',
  'No prompts picked. Leave it empty to let the game pick automatically.': 'לא נבחרו שאלות. השאירו ריק כדי שהמשחק יבחר אוטומטית.',
  '{a} of {b} prompts': '{a} מתוך {b} שאלות', 'Up to 10 prompts per day': 'עד 10 שאלות ביום', '{n} answers': '{n} תשובות', 'used {n}×': 'שימוש {n} פעמים',
  'Nothing matches.': 'אין תוצאות.', Picked: 'נבחרו', 'Pick at least one prompt, or use “Clear day”': 'בחרו לפחות שאלה אחת, או השתמשו ב"ניקוי היום"',
  'Save day': 'שמירת היום', 'The day is full': 'היום מלא', 'Fill with suggestions': 'מילוי בהצעות', 'Day cleared': 'היום נוקה', 'Day saved': 'היום נשמר', 'Clear day': 'ניקוי היום',
  'Question bank': 'מאגר השאלות', 'Unused only': 'רק שלא נוצלו', Status: 'סטטוס', retired: 'הוצאה משימוש', new: 'חדשה', '{n} shown': 'מוצגות {n}',
  Questions: 'שאלות', 'New prompt': 'שאלה חדשה', Prompt: 'שאלה', Used: 'שימושים', 'Last used': 'שימוש אחרון', Answer: 'תשובה', Tier: 'דרגה',
  'Other accepted spellings, separated by |': 'כתיבים נוספים שמתקבלים, מופרדים ב-|', 'other spellings, separated by |': 'כתיבים נוספים, מופרדים ב-|', 'Remove answer': 'הסרת התשובה',
  '1 Most obvious answer\n3 Less common answer | other spelling\n5 Very rare answer': '1 התשובה הכי צפויה\n3 תשובה פחות נפוצה | כתיב נוסף\n5 תשובה נדירה מאוד',
  'Paste answers': 'הדבקת תשובות', 'Saved. {n} earlier answers now scored.': 'נשמר. {n} תשובות קודמות קיבלו ניקוד.', 'Prompt saved': 'השאלה נשמרה',
  'All questions': 'כל השאלות', 'Edit prompt': 'עריכת שאלה', 'Used on {d}. Adding answers re-scores players who typed them.': 'שימשה בתאריכים {d}. הוספת תשובות מעדכנת את הניקוד של מי שכתב אותן.',
  'Answers ({n})': 'תשובות ({n})',
  'Tier 1 is what most people say, tier 5 is valid but rare. Case, accents, niqqud, punctuation, plurals and a leading “the” or ה are ignored automatically.':
    'דרגה 1 היא מה שרוב האנשים יגידו, דרגה 5 נכונה אבל נדירה. ניקוד, אותיות סופיות, כתיב מלא/חסר, רבים, פיסוק וה׳ הידיעה לא משנים.',
  'Other accepted spellings': 'כתיבים נוספים', 'Add answer': 'הוספת תשובה', 'Paste many answers at once': 'הדבקת הרבה תשובות בבת אחת',
  'One per line: the tier (1-5), a space, the answer, then optional other spellings after |.': 'אחת בכל שורה: הדרגה (1-5), רווח, התשובה, ואחרי | כתיבים נוספים אם יש.',
  'Added {n} answers below. Save to keep them.': 'נוספו {n} תשובות למטה. שמרו כדי שיישארו.', 'Add to list': 'הוספה לרשימה', 'Save prompt': 'שמירת השאלה',
  'Prompt restored': 'השאלה הוחזרה', 'Prompt retired: it won’t be picked again': 'השאלה הוצאה משימוש ולא תיבחר שוב', Restore: 'החזרה', Retire: 'הוצאה משימוש',
  'Delete this prompt for good?': 'למחוק את השאלה לתמיד?', 'Prompt deleted': 'השאלה נמחקה', Delete: 'מחיקה',
  'Or paste': 'או הדבקה', 'Skip prompts that already exist': 'לדלג על שאלות שכבר קיימות', 'Merge new answers into existing prompts': 'להוסיף תשובות חדשות לשאלות קיימות',
  'Choose a file or paste some questions': 'בחרו קובץ או הדביקו שאלות', 'Check result': 'תוצאת הבדיקה', Imported: 'יובא',
  '{t} prompts read: {a} would be added, {u} would be updated, {s} skipped (already in the bank).': 'נקראו {t} שאלות: {a} יתווספו, {u} יעודכנו, {s} ידולגו (כבר במאגר).',
  '{t} prompts read: {a} added, {u} updated, {s} skipped (already in the bank).': 'נקראו {t} שאלות: {a} נוספו, {u} עודכנו, {s} דולגו (כבר במאגר).',
  '{n} problems:': '{n} בעיות:', 'No problems found.': 'לא נמצאו בעיות.', 'Imported {n} new prompts': 'יובאו {n} שאלות חדשות',
  'Import & export': 'ייבוא וייצוא', 'Add questions': 'הוספת שאלות', 'Upload a .txt, .csv or .json file, or paste text. The simplest format is plain text:': 'העלו קובץ txt, csv או json, או הדביקו טקסט. הפורמט הכי פשוט הוא טקסט רגיל:',
  'Hebrew works the same way; a prompt with Hebrew letters is marked as a Hebrew prompt. CSV columns: prompt, category, answer, tier, aliases (one row per answer; Excel works). Export the bank as CSV to see an example.':
    'עברית עובדת אותו דבר; שאלה עם אותיות עבריות מסומנת כשאלה בעברית. עמודות CSV: prompt, category, answer, tier, aliases (שורה לכל תשובה; אקסל עובד). ייצאו את המאגר כ-CSV כדי לראות דוגמה.',
  File: 'קובץ', 'When a prompt already exists': 'כששאלה כבר קיימת', 'Check without importing': 'בדיקה בלי ייבוא', Import: 'ייבוא',
  'Export the question bank': 'ייצוא מאגר השאלות', 'Download every active prompt to edit offline or move to another server.': 'הורדת כל השאלות הפעילות לעריכה או להעברה לשרת אחר.',
  Text: 'טקסט', 'CSV (Excel)': 'CSV (אקסל)', Backup: 'גיבוי', 'A single file with everything: users, scores, questions and settings. To restore, stop the server and replace data/outlier.db with it.':
    'קובץ אחד עם הכול: משתמשים, תוצאות, שאלות והגדרות. כדי לשחזר, עצרו את השרת והחליפו בו את data/outlier.db.',
  'Download backup': 'הורדת גיבוי', 'Answer as it should appear': 'התשובה כפי שתופיע', 'Added. {n} rounds re-scored.': 'נוסף. {n} סיבובים קיבלו ניקוד מחדש.', Accept: 'אישור',
  'Same as': 'זהה ל', 'Spelling added. {n} rounds re-scored.': 'הכתיב נוסף. {n} סיבובים קיבלו ניקוד מחדש.', Save: 'שמירה', 'Spelling of…': 'כתיב של…', Reject: 'דחייה',
  'Turned-away answers': 'תשובות שנדחו',
  'Answers players typed that were not on the list. Accept the valid ones with a tier, or mark them as another spelling of an existing answer. Players who typed them get the distance retroactively.':
    'תשובות ששחקנים כתבו ולא היו ברשימה. אשרו את הנכונות עם דרגה, או סמנו אותן ככתיב נוסף של תשובה קיימת. מי שכתב אותן יקבל את המרחק בדיעבד.',
  'Typed answer': 'מה שנכתב', Times: 'פעמים', 'Nothing to review.': 'אין מה לבדוק.',
  'Give each person their temporary password. They choose their own the first time they sign in. These passwords are shown only once.':
    'מסרו לכל אחד את הסיסמה הזמנית שלו. בכניסה הראשונה הם יבחרו סיסמה משלהם. הסיסמאות מוצגות פעם אחת בלבד.',
  Name: 'שם', 'Account created': 'החשבון נוצר', Role: 'תפקיד', 'One person per line': 'אדם אחד בכל שורה', admin: 'מנהל', player: 'שחקן', disabled: 'מושבת',
  'temp password': 'סיסמה זמנית', Manage: 'ניהול', 'User saved': 'המשתמש נשמר', 'Reset password': 'איפוס סיסמה', 'Password reset': 'הסיסמה אופסה',
  'Enable account': 'הפעלת החשבון', 'Disable account': 'השבתת החשבון', 'Played days': 'ימים ששוחקו', 'round {n}': 'סיבוב {n}', 'Let them replay': 'לאפשר לשחק שוב',
  'Delete {u}’s game on {d}? They can then play it again.': 'למחוק את המשחק של {u} מ-{d}? אחרי זה אפשר לשחק אותו שוב.', 'Game deleted': 'המשחק נמחק', 'No games yet.': 'עוד אין משחקים.',
  'Delete user': 'מחיקת משתמש', 'Delete {u} and all their scores?': 'למחוק את {u} ואת כל התוצאות שלו?', 'User deleted': 'המשתמש נמחק', Users: 'משתמשים',
  'Add one person': 'הוספת אדם אחד', 'Add many people': 'הוספת הרבה אנשים', 'One per line: username, name, team. Separate with commas or tabs (paste from Excel).': 'אחד בכל שורה: שם משתמש, שם, צוות. מופרדים בפסיקים או טאבים (אפשר להדביק מאקסל).',
  '{n} accounts created': 'נוצרו {n} חשבונות', 'Create accounts': 'יצירת חשבונות', 'Everyone ({n})': 'כולם ({n})', Metres: 'מטרים', 'Last seen': 'נראה לאחרונה',
  'Settings saved': 'ההגדרות נשמרו', Settings: 'הגדרות', 'The game': 'המשחק', 'Game name': 'שם המשחק', Tagline: 'סלוגן', 'Prompts per day': 'שאלות ביום',
  '(new days only)': '(לימים חדשים בלבד)', 'Seconds per prompt': 'שניות לשאלה', 'Puzzle language': 'שפת החידה', '(for automatically picked days)': '(לימים שנבחרים אוטומטית)',
  'Forgive small spelling mistakes': 'לסלוח על שגיאות כתיב קטנות', 'Let players play past days from the archive (not counted)': 'לאפשר לשחק ימים קודמים מהארכיון (לא נספר)',
  Calendar: 'לוח שנה', 'Time zone': 'אזור זמן', 'New puzzle starts at hour': 'החידה החדשה מתחילה בשעה', '(0 = midnight)': '(0 = חצות)', 'Weeks start on': 'השבוע מתחיל ביום',
  '(weekly leaderboard)': '(לטבלה השבועית)', 'Puzzle days': 'ימי חידה', 'Pick prompts automatically when a puzzle day has none scheduled': 'לבחור שאלות אוטומטית כשאין שאלות מתוזמנות ליום חידה',
  Accounts: 'חשבונות', 'Who can sign up': 'מי יכול להירשם', '(when sign-up needs a code)': '(כשההרשמה דורשת קוד)', 'Save settings': 'שמירת ההגדרות',
  All: 'הכול', Unused: 'לא נוצלו', Retired: 'הוצאו משימוש', 'Alternate English and Hebrew days': 'לסירוגין: יום באנגלית, יום בעברית', 'English only': 'רק אנגלית',
  'Hebrew only': 'רק עברית', 'Mix both': 'ערבוב של שתיהן', 'Anyone on the network can sign up': 'כל מי שברשת יכול להירשם', 'Sign-up needs an invite code': 'ההרשמה דורשת קוד הזמנה',
  'Only admins create accounts': 'רק מנהלים יוצרים חשבונות',
});

export const DICTS = { en: EN, he: HE };

let current = localStorage.getItem('outlier.lang') || ((navigator.language || '').toLowerCase().startsWith('he') ? 'he' : 'en');
export const lang = () => current;
export const dir = () => current === 'he' ? 'rtl' : 'ltr';
export function setLang(l) { current = l === 'he' ? 'he' : 'en'; localStorage.setItem('outlier.lang', current); }

/** Translate. Falls back to English, then to the key itself. */
export function t(key, vars) {
  const d = DICTS[current];
  let s;
  if (vars && Number(vars.n) === 1) s = d[key + '|one'] ?? (current !== 'en' ? undefined : EN[key + '|one']);
  s = s ?? d[key] ?? EN[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`)) : s;
}
