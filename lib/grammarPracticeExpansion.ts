import type { PracticeItem } from './grammarWorksheet'

type Goal = PracticeItem['goal']
type Level = PracticeItem['difficulty']
const expanded: PracticeItem[] = []
const rationale: Record<Level,string> = {
  기본: '직접적인 단서와 한 가지 목표 구조로 개념을 확인합니다.',
  응용: '배운 구조를 바뀐 문맥에 적용하거나 관련 표현을 구별합니다.',
  심화: '복수 조건·의미 관계·전치사 또는 부정 범위를 함께 판단합니다.',
}
function mc(goal:Goal,n:number,difficulty:Level,prompt:string,choices:string[],correct:number,explanation:string){
 expanded.push({fixtureId:`review-${goal}-${n}`,goal,activity:'고르기',difficulty,difficultyReason:rationale[difficulty],prompt,choices,answer:`${['①','②','③','④','⑤'][correct]} ${choices[correct]}`,explanation,rubric:'정답 보기를 선택하면 1점. 다른 보기 또는 복수 선택은 0점.'})
}
function written(goal:Goal,n:number,difficulty:Level,activity:'조건 영작'|'문장 전환',prompt:string,answer:string,explanation:string,rubric?:string){
 expanded.push({fixtureId:`review-${goal}-${n}`,goal,activity,difficulty,difficultyReason:rationale[difficulty],prompt,answer,explanation,rubric:rubric || '총 4점: 목표 to부정사 구조 2점, 제시한 의미 유지 1점, 시작어·제시어 등 명시 조건 충족 1점. 문장 전체 답과 빈칸 답은 지시에 맞게 인정합니다. 대소문자·마침표만의 차이는 감점하지 않습니다. 문법·의미·조건을 모두 충족한 동등 표현도 인정합니다.'})
}

// 명사적 용법: 주어·목적어·보어 및 가주어/진주어 구별.
mc('noun',4,'기본','[ ] 부분이 문장의 주어인 것을 고르세요.',[
'She has a story [to tell].','He came [to see me].','[To exercise] is good for you.','I want [to rest].','Her goal is [to win].'],2,'To exercise가 is의 주어입니다. ④는 목적어, ⑤는 보어입니다.')
mc('noun',5,'기본','[ ] 부분이 주어의 내용을 설명하는 보어인 것을 고르세요.',[
'I need a pen [to write with].','My dream is [to become a chef].','She studies [to pass the test].','[To read] is fun.','They hope [to visit us].'],1,'be동사 뒤의 to become a chef가 My dream의 내용을 설명합니다.')
mc('noun',6,'응용','“우리는 일찍 떠나기로 결정했다.”에 맞게 빈칸을 채우세요.\nWe decided _____ early.',[
'leave','leaving','left','to leave','to leaving'],3,'decide의 목적어에는 to부정사를 사용합니다.')
mc('noun',7,'응용','밑줄 대신 [ ] 부분의 역할이 같은 두 문장을 고르세요.\n(A) She hopes [to travel abroad].\n(B) [To travel abroad] costs money.\n(C) Her plan is [to travel abroad].\n(D) He wants [to travel abroad].\n(E) They worked hard [to travel abroad].',[
'A와 B','B와 C','C와 E','D와 E','A와 D'],4,'A와 D는 모두 동사의 목적어입니다. B는 주어, C는 보어, E는 목적의 부사적 용법입니다.')
mc('noun',8,'응용','It은 가주어입니다. 다음 문장에서 실제 주어에 해당하는 것을 고르세요.\nIt is important to listen carefully.',[
'It is','important','to listen carefully','carefully만','is important'],2,'가주어 It의 실제 내용은 to listen carefully입니다.')
mc('noun',9,'심화','다음 두 문장의 [ ] 역할을 바르게 설명한 것을 고르세요.\n(A) I want [to help my brother].\n(B) I went home [to help my brother].',[
'A: 목적어 / B: 목적을 나타내는 부사어','A: 주어 / B: 목적어','A: 보어 / B: 명사 수식','둘 다 목적어','둘 다 명사 수식'],0,'같은 표현도 want 뒤에서는 목적어, went home 뒤에서는 집에 간 목적을 나타냅니다.')
mc('noun',10,'심화','주어진 뜻과 문법에 모두 맞는 문장을 고르세요.\n“나는 다시는 늦지 않기로 약속했다.”',[
'I promised to not be never late again.','I promised not be late again.','I promised not to be late again.','I promised not to late again.','I promised to be late again.'],2,'to부정사의 부정은 not to be late로 나타냅니다. ⑤는 뜻이 반대이고 나머지는 형태나 부정 표현에 문제가 있습니다.')
written('noun',11,'기본','조건 영작','“그녀는 의사가 되기를 희망한다.”를 영작하세요.\n조건: She로 시작하고 hopes, become, a doctor를 사용하세요. 필요하면 단어를 추가하세요.','She hopes to become a doctor.','hope의 목적어로 to become a doctor를 씁니다.')
written('noun',12,'응용','조건 영작','“나의 계획은 매일 영어를 연습하는 것이다.”를 영작하세요.\n조건: My plan is로 시작하고 practice, English, every day를 사용하세요.','My plan is to practice English every day.','to practice 이하가 주어 My plan의 내용을 설명하는 보어입니다.')
written('noun',13,'응용','조건 영작','“충분한 물을 마시는 것은 중요하다.”를 영작하세요.\n조건: It is로 시작하고 important, drink, enough water를 사용하세요. to부정사를 포함하세요.','It is important to drink enough water.','It은 가주어, to drink enough water는 진주어입니다.')
written('noun',14,'심화','조건 영작','“그는 내 비밀을 말하지 않기로 약속했다.”를 영작하세요.\n조건: He promised로 시작하고 tell, my secret을 사용하세요. to부정사 부분을 부정하세요.','He promised not to tell my secret.','약속 자체가 아니라 말하는 행동을 부정하므로 promised not to tell을 씁니다. He did not promise to tell은 뜻이 다릅니다.')
written('noun',15,'심화','조건 영작','“너에게는 이 문제를 혼자 해결하는 것이 어렵다.”를 영작하세요.\n조건: 가주어 It으로 시작하고 difficult, for you, solve, this problem, on your own을 사용하세요.','It is difficult for you to solve this problem on your own.','가주어 It과 진주어 to solve를 연결하고, 실제 해결하는 사람을 for you로 표시합니다.')
written('noun',16,'기본','문장 전환','뜻이 같도록 빈칸을 채우세요.\nMy dream is becoming a singer.\n→ My dream is _____.\n조건: to부정사를 사용하세요.','to become a singer','보어의 동명사 표현을 to부정사 표현으로 바꿉니다.')
written('noun',17,'응용','문장 전환','뜻이 같도록 바꾸세요.\nTo keep promises is important.\n→ It _____.\n조건: 가주어 It과 진주어 to부정사를 사용하세요.','It is important to keep promises.','원래 주어였던 to keep promises를 뒤로 옮기고 It을 가주어로 둡니다.')
written('noun',18,'응용','문장 전환','주어를 to부정사로 바꾸어 문장 전체를 쓰세요.\nIt is fun to play chess with friends.\n조건: To로 시작하고 원래 의미를 유지하세요.','To play chess with friends is fun.','진주어 to play chess with friends를 문장 앞으로 옮깁니다.')
written('noun',19,'심화','문장 전환','뜻이 같도록 빈칸을 채우세요.\nMina decided that she would not join the club.\n→ Mina decided _____.\n조건: that절 대신 부정형 to부정사를 사용하세요.','not to join the club','결정의 내용이 가입하지 않는 것이므로 decided not to join을 씁니다.')
written('noun',20,'심화','문장 전환','뜻이 같도록 바꾸세요.\nFor children to get enough sleep is important.\n→ It _____.\n조건: for children과 enough sleep을 유지하고 가주어·진주어 구조를 사용하세요.','It is important for children to get enough sleep.','실제 잠을 자는 대상 for children을 유지하면서 가주어 구조로 바꿉니다.')

// 형용사적 용법: 수식 대상, 필요한 전치사, 실제 동작 주체를 함께 확인.
mc('adjective',4,'기본','“먹을 것”에 맞는 표현을 고르세요.',[
'something eat','something to eat','to something eat','something to eating','something ate'],1,'something 뒤의 to eat가 어떤 것인지를 꾸밉니다.')
mc('adjective',5,'기본','다음 문장에서 to write가 꾸미는 말을 고르세요.\nShe has three letters to write.',[
'She','has','three만','letters','문장 전체의 목적'],3,'to write는 써야 할 대상인 letters를 꾸밉니다.')
mc('adjective',6,'응용','“함께 이야기할 친구”라는 뜻이 되도록 고르세요.\na friend _____',[
'to talk','talk to','to talk to','to talking to','to talked to'],2,'그 친구와 이야기한다는 관계이므로 a friend to talk to처럼 전치사 to가 필요합니다.')
mc('adjective',7,'응용','“나는 해야 할 일이 많다.”에 맞는 문장을 고르세요.',[
'I have many things to do.','I have many things do.','I have to many things do.','I have many things to doing.','I have many do to things.'],0,'to do가 things 뒤에서 해야 할 일이라는 뜻을 만듭니다.')
mc('adjective',8,'응용','앞의 명사와 to부정사의 관계가 나머지와 다른 것을 고르세요.',[
'a book to read','homework to finish','a letter to send','a room to clean','a friend to help me'],4,'①~④의 명사는 뒤 동사의 대상입니다. ⑤의 friend는 help me의 동작 주체입니다.')
mc('adjective',9,'심화','“앉을 의자”라는 뜻이 되도록 빈칸을 채우세요.\nI need a chair _____.',[
'to sit','to sit on','sit on it','to sitting on','to sit it'],1,'sit on a chair의 관계를 유지해야 하므로 to sit on이 필요합니다.')
mc('adjective',10,'심화','상황과 문법에 모두 맞는 문장을 고르세요.\n나는 빈 방을 원한다. 내 손님들이 그 방에서 잘 것이다.',[
'I need a room to my guests sleep in.','I need a room for my guests sleep in.','I need a room for my guests to sleep.','I need a room for my guests to sleep in.','I need a room my guests to sleep it.'],3,'잠잘 사람은 for my guests로 나타내고, sleep in a room의 in을 유지합니다.')
written('adjective',11,'기본','조건 영작','“나는 마실 물이 필요하다.”를 영작하세요.\n조건: I need로 시작하고 water, drink를 사용하세요. to부정사로 water를 꾸미세요.','I need water to drink.','to drink가 water를 꾸며 마실 물이라는 뜻을 만듭니다.')
written('adjective',12,'응용','조건 영작','“그녀는 끝내야 할 숙제가 있다.”를 영작하세요.\n조건: She has로 시작하고 homework, finish를 사용하세요. to부정사로 homework를 꾸미세요.','She has homework to finish.','숙제를 끝낼 대상이라고 표현하므로 homework 뒤에 to finish를 둡니다.')
written('adjective',13,'응용','조건 영작','“나는 쓸 펜이 필요하다.”를 영작하세요.\n조건: I need로 시작하고 a pen, write를 사용하세요. 펜을 도구로 쓴다는 관계를 전치사로 나타내세요.','I need a pen to write with.','write with a pen의 도구 관계를 유지해 to write with로 씁니다.')
written('adjective',14,'심화','조건 영작','“그녀는 자신을 도와줄 사람이 필요하다.”를 영작하세요.\n조건: She needs로 시작하고 someone, help, her를 사용하세요. someone이 돕는 사람이 되도록 to부정사를 연결하세요.','She needs someone to help her.','someone은 help의 대상이 아니라 실제로 her를 돕는 동작 주체입니다.')
written('adjective',15,'심화','조건 영작','“나는 아이들이 가지고 놀 장난감이 있다.”를 영작하세요.\n조건: I have로 시작하고 toys, for the children, play를 사용하세요. to부정사와 필요한 전치사를 포함하세요.','I have toys for the children to play with.','실제 놀이 주체는 for the children이고, play with toys의 with가 필요합니다.')
written('adjective',16,'기본','문장 전환','뜻이 같도록 빈칸을 채우세요.\nI have a letter that I must send.\n→ I have a letter _____.\n조건: to부정사를 사용하세요.','to send','보내야 할 편지라는 뜻을 letter 뒤의 to send로 나타냅니다.')
written('adjective',17,'응용','문장 전환','뜻이 같도록 빈칸을 채우세요.\nShe needs a friend that she can talk to.\n→ She needs a friend _____.\n조건: to부정사를 쓰고 필요한 전치사를 유지하세요.','to talk to','친구와 이야기하므로 관계절 끝의 전치사 to를 남깁니다.')
written('adjective',18,'응용','문장 전환','뜻이 같도록 빈칸을 채우세요.\nHe has many problems that he must solve.\n→ He has many problems _____.\n조건: to부정사를 사용하세요.','to solve','문제들이 solve의 대상이 되도록 to solve로 꾸밉니다.')
written('adjective',19,'심화','문장 전환','뜻이 같도록 빈칸을 채우세요.\nWe need a house that we can live in.\n→ We need a house _____.\n조건: to부정사로 바꾸고 장소를 나타내는 관계를 유지하세요.','to live in','live in a house의 관계를 유지하므로 in을 생략하지 않습니다.')
written('adjective',20,'심화','문장 전환','뜻이 같도록 빈칸을 채우세요.\nI have some books that my sister can read.\n→ I have some books _____.\n조건: for my sister와 to부정사를 사용하여 실제 읽는 사람이 바뀌지 않게 하세요.','for my sister to read','읽는 주체는 I가 아니라 my sister이므로 for my sister를 포함합니다.')

// 부사적 용법은 이번 묶음에서 '목적'에 한정. 감정의 원인·결과와 구별.
mc('purpose',4,'기본','“그녀는 빵을 사기 위해 빵집에 갔다.”에 맞게 빈칸을 채우세요.\nShe went to the bakery _____ bread.',[
'buy','buying','bought','to buy','to buying'],3,'빵집에 간 목적을 to buy bread로 나타냅니다.')
mc('purpose',5,'기본','다음 문장에서 공부하는 목적을 나타내는 부분을 고르세요.\nHe studies hard to pass the test.',[
'He','studies','hard','the test만','to pass the test'],4,'왜 열심히 공부하는지 나타내는 to pass the test 전체가 목적 표현입니다.')
mc('purpose',6,'응용','“그녀는 버스를 놓치지 않기 위해 일찍 출발했다.”에 맞는 표현을 고르세요.\nShe left early _____.',[
'in order not to miss the bus','in order to miss the bus','in order not miss the bus','in order to not missing the bus','for not miss the bus'],0,'피하려는 행동 miss를 not to miss로 부정합니다.')
mc('purpose',7,'응용','다음 중 [ ] 부분이 목적을 나타내지 않는 것을 고르세요.',[
'He ran [to catch the train].','I called her [to ask a question].','She was happy [to see her old friend].','We saved money [to buy a computer].','They met [to discuss the plan].'],2,'③은 기쁜 감정의 원인을 나타냅니다. 나머지는 행동을 하는 목적입니다.')
mc('purpose',8,'응용','“나는 집중하기 위해 휴대전화를 껐다.”와 뜻이 같은 문장을 고르세요.',[
'I turned off my phone because I could not focus on anything at all.','I turned off my phone in order to focus.','I turned off my phone in order not to focus.','I wanted to turn on my phone to focus.','I turned off my phone after I had finished focusing.'],1,'집중하려는 목적은 in order to focus입니다. ①은 어려움이라는 이유를 서술할 뿐 동일한 목적을 직접 보존하지 않습니다.')
mc('purpose',9,'심화','목적 표현의 동작 주체가 어색하게 연결된 문장을 고르세요.\n조건: 일반적인 의미로 읽고, 문장 앞 to부정사의 생략된 주어는 주절 주어와 같다고 보세요.',[
'To keep warm, I wore a coat.','To catch the bus, she ran fast.','To improve his English, he reads every day.','To finish my homework, the room was quiet.','To buy bread, they visited the bakery.'],3,'④에서 숙제를 끝내는 주체가 the room이 되어 어색합니다. I worked in a quiet room처럼 실제 사람을 주어로 해야 합니다.')
mc('purpose',10,'심화','다음 두 문장의 [ ] 역할을 바르게 연결한 것을 고르세요.\n(A) She stopped [to drink some water].\n(B) She decided [to drink some water].',[
'둘 다 목적어','A: 명사 수식 / B: 주어','A: 보어 / B: 목적','A: 감정의 원인 / B: 명사 수식','A: 목적 / B: 목적어'],4,'A는 물을 마시기 위해 하던 행동을 멈췄다는 목적이고, B는 결정한 내용인 목적어입니다.')
written('purpose',11,'기본','조건 영작','“그는 축구를 하기 위해 공원에 갔다.”를 영작하세요.\n조건: He went로 시작하고 the park, play soccer를 사용하세요. 목적의 to부정사를 포함하세요.','He went to the park to play soccer.','공원에 간 목적이 to play soccer입니다.')
written('purpose',12,'응용','조건 영작','“우리는 환경을 보호하기 위해 물을 절약한다.”를 영작하세요.\n조건: We로 시작하고 save water, protect, the environment를 사용하세요. 목적의 to부정사를 포함하세요.','We save water to protect the environment.','물을 절약하는 목적을 to protect the environment로 연결합니다. in order to protect도 인정합니다.')
written('purpose',13,'응용','조건 영작','“그녀는 질문하기 위해 손을 들었다.”를 영작하세요.\n조건: She raised로 시작하고 her hand, ask a question을 사용하세요. 목적을 to부정사로 나타내세요.','She raised her hand to ask a question.','raised her hand는 과거 행동, to ask a question은 그 목적입니다.')
written('purpose',14,'심화','조건 영작','“나는 가족을 깨우지 않기 위해 조용히 문을 닫았다.”를 영작하세요.\n조건: I closed로 시작하고 the door, quietly, in order not to, wake, my family를 사용하세요.','I closed the door quietly in order not to wake my family.','문을 닫는 목적은 가족을 깨우는 것이 아니라 깨우지 않는 것입니다. quietly의 자연스러운 위치 차이는 인정합니다.')
written('purpose',15,'심화','조건 영작','“자신의 영어 실력을 향상시키기 위해, 수진이는 매일 영어 뉴스를 듣는다.”를 영작하세요.\n조건: To improve로 시작하고 her English, Sujin, listens to, English news, every day를 사용하세요.','To improve her English, Sujin listens to English news every day.','영어를 향상시키는 사람과 듣는 사람은 모두 Sujin입니다. 문두 목적구 뒤 주절의 주어·동사를 완성합니다.')
written('purpose',16,'기본','문장 전환','뜻이 같도록 빈칸을 채우세요.\nHe went outside because he wanted to get some fresh air.\n→ He went outside _____.\n조건: 목적의 to부정사를 사용하세요.','to get some fresh air','밖에 나간 목적을 to get some fresh air로 나타냅니다.')
written('purpose',17,'응용','문장 전환','목적 표현을 문장 앞으로 옮겨 다시 쓰세요.\nShe exercises every day to stay healthy.\n조건: To로 시작하고 every day를 유지하세요.','To stay healthy, she exercises every day.','목적구를 앞으로 옮겨도 주어 she와 건강을 유지하려는 주체가 일치해야 합니다.')
written('purpose',18,'응용','문장 전환','뜻이 같도록 빈칸을 채우세요.\nThey visited the museum in order to learn about history.\n→ They visited the museum _____.\n조건: in order는 쓰지 말고 목적의 to부정사를 사용하세요.','to learn about history','긍정 목적에서 in order to는 to로 바꾸어 표현할 수 있습니다.')
written('purpose',19,'심화','문장 전환','뜻이 같도록 빈칸을 채우세요.\nHe wrote down the address because he did not want to forget it.\n→ He wrote down the address _____.\n조건: in order not to를 사용하고 it이 가리키는 대상을 유지하세요.','in order not to forget it','주소를 적은 목적은 잊지 않는 것입니다. in order to forget은 반대 뜻입니다.')
written('purpose',20,'심화','문장 전환','다음 문장은 의도한 뜻과 주어 연결이 맞지 않습니다. 의도한 뜻에 맞게 문장 전체를 고쳐 쓰세요.\nTo finish my homework, the room was kept quiet by me.\n의도한 뜻: 나는 숙제를 끝내기 위해 방을 조용하게 유지했다.\n조건: To finish my homework, I로 시작하고 kept the room quiet를 사용하세요.','To finish my homework, I kept the room quiet.','목적구에서 숙제를 끝내는 주체와 주절 주어 I를 일치시킵니다.')

export const expandedGrammarPractice = expanded
