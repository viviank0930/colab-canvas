const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const canvas=$('#canvas'),wrap=$('#canvasWrap'),workspace=$('#workspace'),toast=$('#toast'),connectionLayer=$('#connectionLayer');
let zoom=.72,panX=10,panY=0,tool='select',selected=new Set(),panState=null,dragState=null,boxState=null,connectStart=null,pendingImagePoint=null,idSeed=30;
let undoStack=[],redoStack=[],clipboard=[];
let spaceDown=false,activity=[],pendingAiSelection=[];

const LANGUAGE_STORAGE_KEY='colab_interface_language';
let currentLanguage=localStorage.getItem(LANGUAGE_STORAGE_KEY)==='en'?'en':'zh';
const SUPPORT_MODE_STORAGE_KEY='colab_support_mode';
const SUPPORT_MODES={
  observe:{zh:'观察优先',en:'Observe first',noteZh:'当前为“观察优先”。内容分析仍然只针对团队主动选择的区域。',noteEn:'Observe first is active. Content analysis still applies only to areas selected by the team.'},
  signal:{zh:'轻提示',en:'Light signals',noteZh:'当前为“轻提示”。Pip 可以较早显示协作信号，但仍需团队同意。',noteEn:'Light signals is active. Pip may surface collaboration signals earlier, but the team still decides whether to receive support.'},
  request:{zh:'仅主动邀请',en:'On request only',noteZh:'当前为“仅主动邀请”。Pip 不会主动询问，只响应团队请求。',noteEn:'On request only is active. Pip never initiates a prompt and responds only when the team asks.'}
};
let supportMode=SUPPORT_MODES[localStorage.getItem(SUPPORT_MODE_STORAGE_KEY)]?localStorage.getItem(SUPPORT_MODE_STORAGE_KEY):'observe';
let aiSupportState='observing',aiStateTimer=null,interventionStage='permission',pendingProjectStageIndex=null;
const interventionStats={recovered:0,prompts:0,accepted:0,declined:0};
const languageOriginalText=new WeakMap(),languageOriginalAttributes=new WeakMap();
const EN_UI={
  '团队邀请':'Team invite',
  '共同方向 · 研究工作坊':'Shared Direction · Research workshop',
  '加入今天的':'Join today’s',
  '团队讨论。':'team discussion.',
  '先了解这次讨论的目标与成员，再进入共同画布。你的观点会由你自己记录和决定。':'See the goal and members before entering the shared canvas. You decide what to record and what it means.',
  '讨论信息':'Discussion information','讨论成员':'Discussion members','讨论流程':'Discussion flow','团队人数':'Team size','4 人':'4 people','人':'people','在线':'online','当前在线':'Online now','预计时长':'Duration','45 分钟':'45 min',
  '本次讨论':'Today’s discussion','为什么项目会失去共同方向？':'Why do projects lose a shared direction?','研究阶段':'Research',
  '主持人 · 已在线':'Host · Online','组员 · 已在线':'Member · Online','主持人 · 暂时离线':'Host · Away','组员 · 暂时离线':'Member · Away','你':'You','等待加入':'Waiting to join','加入后显示在团队中':'Shown to the team after joining',
  '今天要完成':'Today’s outcome','收集不同成员对导师反馈的理解':'Collect how each member interprets the tutor’s feedback',
  '最后由团队确认哪些是内容问题，哪些是协作过程问题。':'The team will confirm which issues concern the work and which concern the collaboration process.',
  '记录':'Capture','讨论':'Discuss','投票':'Vote','回顾':'Review',
  '这次讨论共有几人？':'How many people are in this session?','团队人数包含你自己，可在进入前调整。':'Include yourself. You can adjust this before entering.','选择团队人数':'Choose team size','减少团队人数':'Decrease team size','增加团队人数':'Increase team size',
  '这次希望 Pip 怎样参与？':'How should Pip take part in this session?','AI 可以观察协作节奏，但不会自动整理或分析整个画布。':'AI may observe collaboration rhythm, but it never organises or analyses the whole canvas automatically.',
  '观察优先':'Observe first','持续停滞后先询问，再提供最小支持':'Wait through a sustained stall, then ask before offering minimal support',
  '轻提示':'Light signals','较早显示协作信号，仍需团队同意':'Surface collaboration signals earlier, while the team still decides',
  '仅主动邀请':'On request only','只有团队主动请求时 Pip 才出现':'Pip appears only when the team asks',
  '你希望团队怎样称呼你？':'What should the team call you?','输入你的名字':'Enter your name','加入讨论':'Join discussion','请输入名字后再加入。':'Enter your name to join.','当前在线成员':'Members online now','空位':'Open seat','等待成员':'Waiting for member',
  'Pip 不会预先整理画布，只在团队主动选择内容并请求后提供建议。':'Pip never pre-organises the canvas. It offers suggestions only after the team selects content and asks for support.',
  '跳过教程':'Skip tutorial','01 · 欢迎':'01 · Welcome','先由人思考，':'People think first,','再邀请 AI 参与。':'then invite AI.',
  'CoLab 不会自动整理你的画布。团队自由记录，只有框选内容并主动请求后，Pip 才会提供建议。':'CoLab never organises the canvas automatically. The team records freely, and Pip responds only after people select content and ask for support.',
  '框选需要帮助的区域':'Select the area that needs support',
  '02 · 两种阶段':'02 · Two timelines','项目向前走，':'Move the project forward,','会议有节奏。':'keep each session focused.',
  '左侧是项目阶段；顶部是一次会议的记录、讨论、投票与回顾。每一步都有明确目标和完成条件。':'Project stages sit on the left. Session steps sit at the top. Each one has a clear goal and completion condition.',
  '研究':'Research','定义':'Define','构思':'Ideate','开发':'Develop',
  '03 · 录音位置':'03 · Recording location','说完以后，':'After you speak,','随时知道它在哪里。':'you always know where it is.',
  '录音结束后会进入“讨论”中的语音记录。它会保存在当前设备的浏览器中，刷新后仍可播放，也可以下载到本机。':'Recordings appear under Discussion. They stay in this device’s browser, remain playable after refresh, and can be downloaded.',
  '团队语音记录':'Team voice note','讨论 · 已保存在此设备':'Discussion · Saved on this device',
  '04 · 手机协作':'04 · Mobile collaboration','电脑组织全局，':'Organise the whole project on desktop,','手机快速参与。':'contribute quickly on mobile.',
  '成员通过邀请链接进入移动端，可添加观点、投票、录音和查看机器人状态，不需要操作缩小版桌面画布。':'Members join from an invite link to add ideas, vote, record audio, and check the robot without using a scaled-down desktop canvas.',
  '添加一个观点':'Add an idea','上一步':'Back','下一步':'Next','进入工作区':'Enter workspace',
  '共同方向':'Shared Direction','设计协作研究':'Design collaboration research','协作阶段':'Session mode','自由记录':'Open capture',
  '项目':'Projects','四位成员在线':'Four members online','打开新手教程':'Open tutorial','观察':'Observe','邀请成员':'Invite members',
  '项目旅程':'Project journey','探索证据与不同视角':'Explore evidence and perspectives','收集证据':'Collect evidence',
  '明确挑战':'Clarify the challenge','探索可能':'Explore possibilities','制作与测试':'Make and test','共同反思':'Reflect together',
  '画布工具':'Canvas tools','空格 + 拖动平移':'Space + drag to pan','双指滑动平移 · 捏合缩放':'Two-finger pan · Pinch to zoom','选择':'Select','手型':'Hand','便签':'Sticky','文字':'Text','图片':'Image',
  '连接':'Connect','评论':'Comment','AI 分析':'AI Analyse',
  '选择与移动':'Select and move','平移画布':'Pan canvas','添加便签':'Add sticky note','添加文字':'Add text','添加图片':'Add image',
  '连接两个对象':'Connect two objects','添加评论':'Add comment','为观点投票':'Vote for an idea','分析当前选择':'Analyse current selection',
  '团队正在独立收集观察，AI保持安静':'The team is collecting observations independently. AI stays quiet.',
  '会议阶段':'Session steps','完成并继续':'Complete and continue',
  '进入条件':'Entry condition','当前目标':'Current goal','完成条件':'Completion condition',
  '收集事实，而不是急着下结论':'Collect facts before drawing conclusions',
  '项目问题已经建立，团队准备收集资料。':'The project question is clear and the team is ready to collect material.',
  '记录来源、观察、访谈与导师反馈。':'Record sources, observations, interviews, and tutor feedback.',
  '已有足够证据，可以描述主要模式。':'There is enough evidence to describe the main patterns.',
  '完成研究，进入定义':'Complete Research, enter Define','完成定义，进入构思':'Complete Define, enter Ideate','完成构思，进入开发':'Complete Ideate, enter Develop','完成开发，进入回顾':'Complete Develop, enter Review','完成回顾，进入研究':'Complete Review, return to Research',
  '仅主持人可见':'Host only','协作观察':'Collaboration signals','讨论停滞':'Discussion stalled',
  '当前 AI 状态':'Current AI state','安静观察':'Observing quietly','团队仍在推进，Pip 不会打断讨论。':'The team is still moving forward, so Pip will not interrupt.',
  '持续观察到协作信号':'Persistent collaboration signal','Pip 会先等待团队自行恢复。':'Pip waits first to see whether the team recovers on its own.',
  '询问是否需要支持':'Ask whether support is needed','本次支持方式':'Support mode for this session','AI 观察中':'AI observing','正在安静观察':'Observing quietly',
  'Pip 正在征求同意':'Pip is asking permission','需要一个提示吗？':'Would a prompt help?','我注意到这个话题已经重复了一段时间。你们想继续自己讨论，还是希望我提出一个反思问题？':'I noticed that this topic has been repeating for a while. Would you like to continue discussing it yourselves, or would a reflective question help?',
  '继续讨论':'Continue discussing','查看原因':'See why','给一个问题':'Give us one question',
  '过去 8 分钟没有出现新主题':'No new theme has appeared for 8 minutes',
  '关于“如何整合导师反馈”的讨论已重复出现 4 次。':'The topic of integrating tutor feedback has repeated four times.',
  '查看相关内容':'View related content','邀请讨论':'Invite discussion','参与平衡':'Participation balance','有 2 位成员尚未回应':'Two members have not responded',
  '这是参与提示，不用于评价个人贡献。':'This is a participation prompt, not an evaluation of individual contribution.',
  '暂时忽略':'Dismiss for now','AI 只提出提醒，不会自动打断团队或控制机器人。':'AI only raises prompts. It never interrupts the team or controls the robot automatically.',
  'AI Selection':'AI Selection','Pip · 协作伙伴':'Pip · Collaboration partner','等待团队邀请':'Waiting for the team',
  '理解':'Understand','记忆':'Memory','报告':'Activity','人类控制':'Human control','团队主导，Pip 提供支持。':'The team leads. Pip supports.',
  '只有当你框选内容并主动请求时，Pip 才会分析该区域。':'Pip analyses an area only after you select it and explicitly ask.',
  '当前理解':'Current understanding','尚未确认':'Not confirmed','是什么让团队失去共同方向？':'What causes a team to lose shared direction?',
  '当前阶段':'Current stage','已选择证据':'Selected evidence','无':'None','从你的选择开始反思':'Start with your selection',
  '框选一组便签，再选择':'Select a group of notes, then choose','Pip 只呈现模式与问题，不改变画布。':'Pip shows patterns and questions without changing the canvas.',
  '正在录音':'Recording','停止后保存在当前浏览器的“讨论”中，不会自动下载或上传':'Saved under Discussion in this browser when stopped. It will not download or upload automatically.',
  '停止':'Stop','询问协作伙伴':'Ask your collaboration partner','我们应该一起反思什么？':'What should we reflect on together?','只包含你主动选择的画布内容':'Only includes canvas content you selected',
  '附件':'Attach','语音':'Voice','询问 Pip':'Ask Pip','录音保存在当前浏览器的网站数据中，可逐条删除或全部清空。':'Recordings stay in this browser’s site data. Delete them individually or clear them all.',
  '总结所选内容':'Summarise selection','建议讨论问题':'Suggest a discussion question',
  '研究 · 自由记录':'Research · Open capture','切换项目阶段':'Switch project stage','收集':'Collect','聚焦':'Focus','发散':'Explore','测试':'Test','确认':'Confirm',
  '01 / 05 · 研究阶段':'01 / 05 · Research','当前目标：记录来源、观察、访谈与导师反馈。':'Current goal: Record sources, observations, interviews, and tutor feedback.',
  '查看阶段说明':'View stage guide','添加一个观察':'Add an observation','录音仅保存在本浏览器，可在“我的”清空':'Recordings stay in this browser and can be cleared under Me',
  '录音':'Record','团队讨论':'Team discussion','问题与语音记录':'Questions and voice notes','还没有新的讨论':'No new discussion yet',
  '提出问题或录制一段语音，内容会同步到团队工作区。':'Ask a question or record audio to sync it with the team workspace.',
  '实体设备':'Physical device','Pip 机器人':'Pip robot','在线，等待指令':'Online, waiting','机器人只在主持人确认后沿固定轨迹移动。':'The robot moves along its fixed route only after host approval.',
  '当前位置':'Current position','起点':'Start','电量':'Battery','当前任务':'Current task','等待团队开始':'Waiting for the team',
  '请求机器人收集意见':'Ask robot to collect input','参与记录':'Participation record','我的贡献':'My contribution','今天':'Today',
  '新增观点':'Ideas added','参与投票':'Votes cast','语音记录':'Voice notes','这些数据用于帮助参与更公平，不用于成员排名。':'These records support fair participation and are never used to rank members.',
  '录音存储':'Recording storage','当前浏览器的网站数据':'This browser’s site data','不会自动进入电脑“下载”文件夹，也不会上传到云端。清除后无法恢复。':'Nothing is automatically downloaded or uploaded. Deleted recordings cannot be recovered.',
  '删除全部录音':'Delete all recordings','画布':'Canvas','机器人':'Robot','我的':'Me','停止并保存':'Stop and save',
  '阶段结束前':'Before ending the stage','先回顾团队怎样完成了这一阶段':'First, review how the team completed this stage','这些记录只用于调整下一阶段的支持方式，不用于成员排名。':'These records only adjust support for the next stage. They are never used to rank members.',
  '团队自行恢复':'Team recovered independently','AI 主动询问':'AI asked proactively','接受支持':'Support accepted','继续自主讨论':'Continued independently',
  '下一阶段希望 Pip 怎样参与？':'How should Pip take part in the next stage?','降低支持':'Reduce support','下一阶段仅在团队主动邀请时出现':'Pip appears only when the team asks in the next stage',
  '保持当前方式':'Keep current mode','继续使用观察优先':'Continue with Observe first','重新选择':'Choose again','进入下一阶段前选择新的支持方式':'Choose a new support mode before entering the next stage',
  '新的支持方式':'New support mode','返回画布':'Return to canvas','确认并进入下一阶段':'Confirm and enter the next stage',
  '停止后保存在当前浏览器，不会自动下载或上传':'Saved in this browser when stopped. It will not download or upload automatically.',
  '这个阶段还没有团队便签':'No team notes in this stage yet','点击上方加号添加第一条内容。':'Tap the plus button above to add the first note.',
  '人在线':' people online','刚刚':'Just now',
  '定义阶段':'Define','把证据转化为共同的问题':'Turn evidence into a shared question',
  '研究材料已具备，并能看到初步模式。':'Research material is ready and early patterns are visible.',
  '区分事实、解释和协作过程中的信号。':'Separate facts, interpretations, and collaboration signals.',
  '团队确认了一个清晰的问题陈述。':'The team has confirmed a clear problem statement.','我们真正需要解决的问题是什么？':'What problem do we really need to solve?',
  '明确挑战':'Clarify the challenge','补充一条证据':'Add evidence','AI 只分析团队主动框选的材料':'AI only analyses material selected by the team',
  '成员 B':'Member B','朗读冲突观点并询问确认':'Read conflicting views and ask for confirmation',
  'Pip 停在发言者附近，读出两种不同理解，由团队确认问题表述。':'Pip stops near the speaker, reads two interpretations, and waits for the team to confirm the wording.',
  '构思阶段':'Ideate','先发散，再由团队决定如何归类':'Explore first, then let the team decide how to group ideas',
  '问题陈述已由团队共同确认。':'The problem statement has been confirmed by the team.',
  '产生多种方向，框选后再请求 AI 提供分类建议。':'Generate multiple directions, then select ideas before asking AI for grouping suggestions.',
  '团队选出值得进一步发展的方向。':'The team has selected directions worth developing.','哪些可能性值得我们继续探索？':'Which possibilities are worth exploring?',
  '发散与归类':'Explore and group','添加一个新点子':'Add a new idea','先自由发散，稍后再分类和投票':'Explore freely first, then group and vote',
  '桌面中心':'Table centre','邀请安静成员补充点子':'Invite quieter members to add ideas',
  '当讨论重复或停滞时，Pip 只提出问题并邀请更多成员参与。':'When discussion repeats or stalls, Pip only asks a question and invites more people to contribute.',
  '开发阶段':'Develop','把方向变成可以测试的原型':'Turn a direction into a testable prototype',
  '已有明确方向和成功标准。':'The direction and success criteria are clear.','制作原型、分配任务并记录真实测试反馈。':'Build a prototype, assign tasks, and record real test feedback.',
  '原型经过至少一轮真实测试。':'The prototype has completed at least one real test.','我们怎样快速验证这个方向？':'How can we test this direction quickly?',
  '记录一条测试反馈':'Record test feedback','标记观察、问题和下一版修改':'Mark observations, issues, and changes for the next version',
  '测试位 C':'Test station C','播报测试步骤与计时提醒':'Announce test steps and time prompts',
  'Pip 沿固定轨道到测试位，播报当前任务和剩余时间，不替团队评价结果。':'Pip follows the fixed track to the test station and announces tasks and remaining time without judging results.',
  '回顾阶段':'Review','总结学习，并由人确认下一步':'Summarise learning and let people confirm the next step',
  '原型和测试反馈已经汇总。':'Prototype and test feedback have been collected.','确认有效部分、风险、未解决问题和负责人。':'Confirm what worked, risks, unresolved questions, and owners.',
  '团队确认下一轮行动和负责人。':'The team has confirmed the next action and owner.','这次协作让我们学到了什么？':'What did we learn from this collaboration?',
  '补充一条反思':'Add a reflection','记录学习，不用于成员排名':'Record learning, never member rankings','总结输出位':'Summary station',
  '语音播报已确认的行动':'Announce confirmed actions','只有团队确认总结后，Pip 才会播报下一步或连接打印设备输出摘要。':'Pip announces next steps or prints a summary only after the team confirms it.',
  '实体协作路径':'Physical collaboration route','等待主持人开始':'Waiting for host','固定轨迹连接四个座位。机器人按顺序收集语音，不会在桌面自由移动。':'A fixed route connects four seats. The robot collects voice input in order and never roams freely.',
  '预览收集路径':'Preview collection route','事实':'Facts','不同解释':'Interpretations','协作信号':'Collaboration signals',
  '资料分散在多个平台':'Material is spread across platforms','会议结束后没有行动记录':'No action record after meetings','成员引用了不同版本的反馈':'Members reference different feedback versions',
  '导师希望我们缩小主题':'The tutor wants a narrower topic','导师希望我们调整协作方法':'The tutor wants a different collaboration method',
  '同一话题重复出现':'The same topic keeps repeating','两位成员尚未表达观点':'Two members have not shared a view',
  '团队正在确认的问题陈述':'Problem statement under team review','我们怎样让分散反馈变成团队共同理解，并明确下一步？':'How might we turn scattered feedback into shared understanding and a clear next step?',
  '这句话仍可编辑。AI 只指出所选材料中的冲突，不会替团队定稿。':'This statement remains editable. AI can flag conflicts in selected material but never finalises it.',
  '确认后进入构思':'Confirm, then enter Ideate','Pip 在成员 B':'Pip is at member B','“你们说的是内容问题，还是协作过程问题？”':'“Are you describing a content issue or a collaboration issue?”',
  '机器人朗读问题，等待成员讨论。':'The robot reads the question and waits for discussion.',
  '自由发散区':'Open exploration','先增加可能性，不急着整理':'Add possibilities before organising','添加点子':'Add idea',
  '会议后自动生成行动清单':'Generate an action list after meetings','用颜色区分反馈来源':'Use colour to distinguish feedback sources',
  '让机器人邀请安静成员':'Let the robot invite quieter members','给每个决定保留来源链接':'Keep source links for every decision',
  '用桌面轨迹代表讨论节奏':'Use the table route to represent discussion rhythm','阶段结束前进行快速投票':'Run a quick vote before ending the stage',
  '团队框选后':'After team selection','分类建议预览':'Grouping suggestion preview','尚未应用':'Not applied',
  '信息结构':'Information structure','来源、行动记录、决定链接':'Sources, action records, decision links','参与方式':'Participation','邀请发言、快速投票':'Speaking invitations, quick votes',
  '实体交互':'Physical interaction','固定路径、语音提醒':'Fixed route, voice prompts','讨论分类':'Discuss groups','由团队确认分类':'Team confirms groups',
  'Pip 在桌面中心':'Pip is at the table centre','“还有谁有完全不同的方向？”':'“Who has a completely different direction?”','它只提出问题，不移动便签。':'It only asks questions and never moves notes.',
  '当前原型':'Current prototype','固定轨迹协作机器人':'Fixed-route collaboration robot','网页管理讨论内容，小车负责到达指定成员、收集语音并播报提醒。':'The website manages discussion content. The robot reaches a member, collects voice input, and announces prompts.',
  '屏幕 + 语音':'Screen + voice','本轮测试':'Current test','进行中':'In progress','识别四个固定座位':'Recognise four fixed seats','到成员 B 后停止':'Stop at member B',
  '录音同步到讨论区':'Sync recording to Discussion','播报下一步提醒':'Announce the next-step prompt','现场反馈':'Test feedback','记录反馈':'Record feedback',
  '有效':'Works','固定路径让移动更容易理解。':'The fixed route makes movement easier to understand.','待改进':'Needs work','需要在网页显示机器人下一站。':'Show the robot’s next stop on the website.',
  '桌面固定路径':'Fixed table route','当前位置：测试位 C。下一站需要主持人确认。':'Current position: Test station C. The host must confirm the next stop.',
  '协作结果草稿':'Collaboration outcome draft','等待团队确认':'Waiting for team confirmation','Pip 总结预览':'Pip summary preview',
  '固定空间与固定轨迹，让实体 AI 的参与更可控。':'A fixed space and route make physical AI participation more controllable.',
  '双轮小车负责移动和提醒，显示屏负责表情与语音。网站记录材料、讨论与人类确认的决定。':'The two-wheel robot handles movement and prompts. The display handles expressions and voice. The website records material, discussion, and human-confirmed decisions.',
  '已确认':'Confirmed','双轮底盘 + 独立显示屏':'Two-wheel base + separate display','体积更适合桌面场景。':'A better size for a tabletop setting.',
  '关键风险':'Key risk','录音与成员位置同步':'Syncing voice and member position','需要在真实设备上继续验证。':'Needs further testing on real hardware.',
  '未解决':'Unresolved','小车如何识别下一位成员':'How the robot identifies the next member','先使用固定座位编号。':'Start with fixed seat numbers.',
  '下一步':'Next step','连接 ESP32 屏幕与网页':'Connect the ESP32 display to the website','负责人：王雨堃':'Owner: 王雨堃',
  '机器人输出':'Robot output','语音播报 + 可选打印摘要':'Voice announcement + optional printed summary','团队确认下一步':'Team confirms next step',
  'Pip 在总结输出位':'Pip is at the summary station','等待团队确认后播报':'Waiting for confirmation before speaking','未确认的 AI 建议不会进入项目结论。':'Unconfirmed AI suggestions never enter project conclusions.',
  '当前工作':'Current work','收集不同成员的观察':'Collect observations from different members','机器人按固定路径到成员位置，主持人确认后开始录音。':'The robot follows the fixed route to a member and records only after host approval.',
  '问题定义':'Problem definition','比较证据与不同理解':'Compare evidence and interpretations','资料分散':'Scattered material','解释':'Interpretation','需要缩小方向':'The direction needs narrowing',
  '查看共同问题陈述':'View shared problem statement','先添加点子，再由团队确认类别':'Add ideas first, then let the team confirm groups',
  '分类只是建议预览，原始点子不会被移动。':'Grouping is only a suggestion preview. Original ideas remain unchanged.',
  '原型测试':'Prototype test','2 / 4':'2 / 4','测试项已完成':'test items complete','记录一次反馈':'Record feedback',
  '回顾总结':'Review summary','由团队确认结论与负责人':'The team confirms conclusions and owners','已确认：双轮底盘与独立显示屏':'Confirmed: two-wheel base and separate display',
  '下一步：连接 ESP32 屏幕与网页':'Next: connect the ESP32 display to the website','确认下一步':'Confirm next step'
};
const LANGUAGE_ATTRIBUTES=['aria-label','title','placeholder'];
const EN_UI_PARTS=Object.entries(EN_UI).sort((a,b)=>b[0].length-a[0].length);
function translatedUiValue(value){
  const trimmed=String(value||'').trim();
  if(!trimmed)return null;
  if(EN_UI[trimmed])return EN_UI[trimmed];
  let output=trimmed,changed=false;
  EN_UI_PARTS.forEach(([source,target])=>{
    if(output.includes(source)){output=output.split(source).join(target);changed=true}
  });
  if(!changed)return null;
  return output.replaceAll('：',': ').replaceAll('。','.').replace(/\s{2,}/g,' ').trim();
}
function languageTextNodes(root=document){
  if(root.nodeType===Node.TEXT_NODE)return [root];
  const nodes=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode())nodes.push(walker.currentNode);
  return nodes;
}
function languageElements(root=document){
  if(root.nodeType===Node.DOCUMENT_NODE)return [...document.querySelectorAll('*')];
  if(root.nodeType===Node.TEXT_NODE)return root.parentElement?[root.parentElement]:[];
  return root.nodeType===Node.ELEMENT_NODE?[root,...root.querySelectorAll('*')]:[];
}
function isInterfaceText(node){
  const parent=node.parentElement;
  return parent&&!parent.closest('script,style,.sticky,.text-block,.comment-pin,.mobile-note,.ai-message,.human-message,.voice-note,.mobile-voice-note,[contenteditable="true"]');
}
function translateInterface(root=document){
  languageTextNodes(root).forEach(node=>{
    if(!isInterfaceText(node))return;
    if(!languageOriginalText.has(node))languageOriginalText.set(node,node.nodeValue);
    const original=languageOriginalText.get(node),translated=translatedUiValue(original);
    if(!translated)return;
    const lead=original.match(/^\s*/)?.[0]||'',trail=original.match(/\s*$/)?.[0]||'';
    node.nodeValue=`${lead}${translated}${trail}`;
  });
  languageElements(root).forEach(el=>LANGUAGE_ATTRIBUTES.forEach(attribute=>{
    if(!el.hasAttribute?.(attribute))return;
    let originals=languageOriginalAttributes.get(el);if(!originals){originals={};languageOriginalAttributes.set(el,originals)}
    if(!(attribute in originals))originals[attribute]=el.getAttribute(attribute);
    const translated=translatedUiValue(originals[attribute]);if(translated)el.setAttribute(attribute,translated);
  }));
}
function restoreInterface(root=document){
  languageTextNodes(root).forEach(node=>{if(languageOriginalText.has(node))node.nodeValue=languageOriginalText.get(node)});
  languageElements(root).forEach(el=>{const originals=languageOriginalAttributes.get(el);if(originals)Object.entries(originals).forEach(([name,value])=>el.setAttribute(name,value))});
}
function updateLanguageControls(){
  $$('[data-language-toggle]').forEach(button=>{
    button.querySelectorAll('[data-lang-option]').forEach(option=>option.classList.toggle('active',option.dataset.langOption===currentLanguage));
    button.setAttribute('aria-label',currentLanguage==='zh'?'Switch to English':'切换到中文');
    button.setAttribute('title',currentLanguage==='zh'?'English':'中文');
  });
}
function applyLanguage(language,{persist=true,announce=false}={}){
  currentLanguage=language==='en'?'en':'zh';
  document.documentElement.lang=currentLanguage==='en'?'en':'zh-CN';
  document.documentElement.dataset.language=currentLanguage;
  restoreInterface(document);
  if(currentLanguage==='en')translateInterface(document);
  document.title=currentLanguage==='en'?'CoLab - AI Collaboration Workspace':'CoLab - AI 协作空间';
  updateLanguageControls();
  updateSupportModeUI();
  if(persist)localStorage.setItem(LANGUAGE_STORAGE_KEY,currentLanguage);
  if(announce)notify(currentLanguage==='en'?'Interface language: English':'界面语言：中文');
}
function initLanguage(){
  $$('[data-language-toggle]').forEach(button=>button.onclick=()=>applyLanguage(currentLanguage==='zh'?'en':'zh',{announce:true}));
  new MutationObserver(mutations=>{
    if(currentLanguage!=='en')return;
    mutations.forEach(mutation=>mutation.addedNodes.forEach(node=>translateInterface(node.nodeType===Node.TEXT_NODE?node:node)));
    updateLanguageControls();
  }).observe(document.body,{childList:true,subtree:true});
  applyLanguage(currentLanguage,{persist:false});
}

function localText(zh,en){return currentLanguage==='en'?en:zh}
function supportModeName(mode=supportMode){const item=SUPPORT_MODES[mode]||SUPPORT_MODES.observe;return currentLanguage==='en'?item.en:item.zh}
function updateSupportModeUI(){
  $$('input[name="supportMode"]').forEach(input=>input.checked=input.value===supportMode);
  const config=SUPPORT_MODES[supportMode]||SUPPORT_MODES.observe;
  if($('#partnerSupportMode'))$('#partnerSupportMode').textContent=supportModeName();
  if($('#facilitatorModeNote'))$('#facilitatorModeNote').textContent=currentLanguage==='en'?config.noteEn:config.noteZh;
  if($('#keepSupportDescription'))$('#keepSupportDescription').textContent=localText(`继续使用${config.zh}`,`Continue with ${config.en}`);
  if($('#customSupportMode'))$('#customSupportMode').value=supportMode;
  setAiSupportState(aiSupportState,{temporary:aiSupportState==='stepped-back'});
}
function setSupportMode(mode,{persist=true,announce=false}={}){
  if(!SUPPORT_MODES[mode])return;
  supportMode=mode;
  if(persist)localStorage.setItem(SUPPORT_MODE_STORAGE_KEY,mode);
  updateSupportModeUI();
  if(announce)notify(localText(`Pip 已切换为“${SUPPORT_MODES[mode].zh}”`,`Pip support mode: ${SUPPORT_MODES[mode].en}`));
}
function stateCopy(state){
  if(state==='waiting')return{label:localText('AI 正在等待','AI waiting'),panel:localText('等待团队自行恢复','Waiting for the team to recover'),title:localText('先等待团队','Waiting before intervening'),description:localText('Pip 观察到协作信号，但现在不会打断讨论。','Pip noticed a collaboration signal but will not interrupt yet.')};
  if(state==='asking')return{label:localText('等待团队确认','Waiting for team choice'),panel:localText('正在征求同意','Asking permission'),title:localText('征求团队同意','Asking the team'),description:localText('只有团队同意后，Pip 才会提出一个反思问题。','Pip will ask one reflective question only if the team agrees.')};
  if(state==='supporting')return{label:localText('提供最小支持','Offering minimal support'),panel:localText('只提供一个问题','One question only'),title:localText('最小支持','Minimal support'),description:localText('Pip 只提出一个问题，不总结、不整理，也不替团队决定。','Pip asks one question without summarising, organising, or deciding for the team.')};
  if(state==='stepped-back')return{label:localText('Pip 已退出','Pip stepped back'),panel:localText('团队继续主导','The team is leading again'),title:localText('已经退出讨论','Stepped out of the discussion'),description:localText('本次支持已经结束，Pip 返回安静观察。','This support moment is complete. Pip is returning to quiet observation.')};
  if(supportMode==='request')return{label:localText('等待团队邀请','Waiting for the team'),panel:localText('仅响应主动请求','Responding only on request'),title:localText('等待团队邀请','Waiting for the team'),description:localText('Pip 不会主动询问，只响应团队发起的请求。','Pip will not initiate prompts and responds only when the team asks.')};
  return{label:localText('AI 观察中','AI observing'),panel:localText('正在安静观察','Observing quietly'),title:localText('安静观察','Observing quietly'),description:localText('团队仍在推进，Pip 不会打断讨论。','The team is still moving forward, so Pip will not interrupt.')};
}
function setAiSupportState(state,{temporary=false}={}){
  aiSupportState=state;
  document.body.dataset.aiSupportState=state;
  const copy=stateCopy(state);
  if($('#aiStateLabel'))$('#aiStateLabel').textContent=copy.label;
  if($('#aiPanelState'))$('#aiPanelState').textContent=copy.panel;
  if($('#mobileAiState'))$('#mobileAiState').textContent=copy.panel;
  if($('#facilitatorStateTitle'))$('#facilitatorStateTitle').textContent=copy.title;
  if($('#facilitatorStateDescription'))$('#facilitatorStateDescription').textContent=copy.description;
  clearTimeout(aiStateTimer);
  if(temporary)aiStateTimer=setTimeout(()=>setAiSupportState('observing'),3600);
}
function updateInterventionMetrics(){
  if($('#metricRecovered'))$('#metricRecovered').textContent=String(interventionStats.recovered);
  if($('#metricPrompts'))$('#metricPrompts').textContent=String(interventionStats.prompts);
  if($('#metricAccepted'))$('#metricAccepted').textContent=String(interventionStats.accepted);
  if($('#metricDeclined'))$('#metricDeclined').textContent=String(interventionStats.declined);
}
function openInterventionPrompt(){
  if(supportMode==='request'){
    notify(localText('当前为“仅主动邀请”，Pip 不会主动打断团队','Pip is on request only and will not initiate a prompt'));
    return;
  }
  interventionStage='permission';interventionStats.prompts++;updateInterventionMetrics();setAiSupportState('asking');
  $('#interventionKicker').textContent=localText('Pip 正在征求同意','Pip is asking permission');
  $('#interventionTitle').textContent=localText('需要一个提示吗？','Would a prompt help?');
  $('#interventionMessage').textContent=localText('我注意到这个话题已经重复了一段时间。你们想继续自己讨论，还是希望我提出一个反思问题？','I noticed that this topic has been repeating for a while. Would you like to continue discussing it yourselves, or would a reflective question help?');
  $('#continueWithoutAi').textContent=localText('继续讨论','Continue discussing');
  $('#askWhyIntervention').classList.remove('hidden');$('#acceptAiPrompt').classList.remove('hidden');
  $('#interventionPrompt').classList.remove('hidden');$('#facilitatorTray').classList.add('hidden');
  logActivity('AI asked permission','Pip noticed a persistent signal and asked before offering support');
}
function stepBackFromIntervention({recovered=false,declined=false}={}){
  if(recovered)interventionStats.recovered++;
  if(declined)interventionStats.declined++;
  updateInterventionMetrics();$('#interventionPrompt').classList.add('hidden');setAiSupportState('stepped-back',{temporary:true});
  logActivity('AI stepped back',recovered?'The team chose to continue independently':'Minimal support ended and control returned to the team');
  notify(localText('Pip 已退出，团队继续主导讨论','Pip stepped back. The team is leading again'));
}
function offerMinimalPrompt(){
  interventionStage='support';interventionStats.accepted++;updateInterventionMetrics();setAiSupportState('supporting');
  workspace.classList.remove('ai-closed');$('#aiPanel').classList.remove('closed');switchTab('chat');
  addAi(localText('我只提出一个问题：你们反复讨论的是反馈内容本身，还是彼此理解反馈的方式？我先停在这里，由你们继续讨论。','I will ask one question only: Are you repeatedly discussing the feedback itself, or the way you interpret it together? I will stop here and let the team continue.'));
  $('#interventionKicker').textContent=localText('最小支持','Minimal support');$('#interventionTitle').textContent=localText('Pip 只提出了一个问题','Pip asked one question');
  $('#interventionMessage').textContent=localText('这个问题不会改变画布，也不会生成结论。准备好继续时，让 Pip 退出讨论。','This question does not change the canvas or create a conclusion. When ready, let Pip step out of the discussion.');
  $('#continueWithoutAi').textContent=localText('支持结束，继续讨论','End support and continue');$('#askWhyIntervention').classList.add('hidden');$('#acceptAiPrompt').classList.add('hidden');
  logActivity('Minimal support accepted','Pip asked one reflective question and did not alter the canvas');
}
function openStageReflection(nextIndex){
  pendingProjectStageIndex=nextIndex;updateInterventionMetrics();
  const stage=projectStages[projectStageIndex];
  const stageNameEn={Research:'Research',Define:'Define',Ideate:'Ideate',Develop:'Develop',Review:'Review'}[stage.key]||stage.key;
  $('#stageReflectionTitle').textContent=localText(`${stage.label}结束前，先回顾团队怎样完成了这一阶段`,`Before leaving ${stageNameEn}, review how the team completed it`);
  const shouldLower=supportMode!=='request'&&(interventionStats.recovered>0||interventionStats.declined>interventionStats.accepted);
  const recommendation=$(`input[name="nextSupport"][value="${shouldLower?'lower':'keep'}"]`);if(recommendation)recommendation.checked=true;
  $('#customSupportPicker').classList.add('hidden');$('#stageReflectionDialog').showModal();
}
function resetInterventionStats(){Object.keys(interventionStats).forEach(key=>interventionStats[key]=0);updateInterventionMetrics()}

function notify(msg){toast.textContent=msg;toast.classList.add('show');clearTimeout(window.__toast);window.__toast=setTimeout(()=>toast.classList.remove('show'),2200)}
function transform(){canvas.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`;$('#zoomValue').textContent=`${Math.round(zoom*100)}%`}
function canvasPoint(e){const r=wrap.getBoundingClientRect();return{x:(e.clientX-r.left-panX)/zoom,y:(e.clientY-r.top-panY)/zoom}}
function select(el,add=false){if(!add)clearSelection();if(!el?.dataset.id)return;selected.add(el.dataset.id);el.classList.add('selected');updateSelectionBar()}
function clearSelection(){selected.clear();$$('.object.selected').forEach(el=>el.classList.remove('selected'));updateSelectionBar()}
function logActivity(type,detail){activity.unshift({type,detail,time:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})});activity=activity.slice(0,40);renderActivity()}
function renderActivity(){const list=$('#activityList');if(!list)return;list.innerHTML=activity.length?activity.map(item=>`<article><i>${item.type.slice(0,1)}</i><div><strong>${item.type}</strong><p>${item.detail}</p><time>${item.time}</time></div></article>`).join(''):'<div class="activity-empty">Canvas actions will be recorded here.</div>'}
function updateSelectionBar(){
  const n=selected.size,bar=$('#selectionActions');$('#selectedCount').textContent=n;bar.classList.toggle('hidden',n<1);if(!n)return;
  const items=[...selected].map(id=>$(`[data-id="${id}"]`)).filter(Boolean);if(!items.length)return;
  const wrapRect=wrap.getBoundingClientRect(),rects=items.map(el=>el.getBoundingClientRect());
  const selectionTop=Math.min(...rects.map(rect=>rect.top)),selectionRight=Math.max(...rects.map(rect=>rect.right)),selectionBottom=Math.max(...rects.map(rect=>rect.bottom));
  const gap=12,margin=12,barWidth=bar.offsetWidth,barHeight=bar.offsetHeight;
  const viewportLeft=wrap.scrollLeft,viewportTop=wrap.scrollTop;
  let left=selectionRight-wrapRect.left+viewportLeft+gap;
  if(left+barWidth>viewportLeft+wrap.clientWidth-margin)left=selectionRight-wrapRect.left+viewportLeft-barWidth;
  left=Math.max(viewportLeft+margin,Math.min(left,viewportLeft+wrap.clientWidth-barWidth-margin));
  let top=selectionTop-wrapRect.top+viewportTop-barHeight-gap;
  if(top<viewportTop+margin)top=selectionBottom-wrapRect.top+viewportTop+gap;
  top=Math.max(viewportTop+margin,Math.min(top,viewportTop+wrap.clientHeight-barHeight-margin));
  bar.style.left=`${left}px`;bar.style.top=`${top}px`;bar.style.transform='none';
}
function snapshot(){return $$('.object').map(el=>el.outerHTML)}
function saveHistory(){undoStack.push(snapshot());if(undoStack.length>30)undoStack.shift();redoStack=[];updateHistoryButtons()}
function restore(state){$$('.object').forEach(el=>el.remove());canvas.insertAdjacentHTML('beforeend',state.join(''));$$('.object').forEach(bindObject);clearSelection();renderConnections()}
function undo(){if(!undoStack.length)return;redoStack.push(snapshot());restore(undoStack.pop());updateHistoryButtons();notify('Undone');logActivity('Undo','Reverted the last canvas change')}
function redo(){if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop());updateHistoryButtons();notify('Redone');logActivity('Redo','Restored the reverted canvas change')}
function updateHistoryButtons(){$('#undoBtn').disabled=!undoStack.length;$('#redoBtn').disabled=!redoStack.length}
function createObject(type,x,y,extra={}){saveHistory();const id=`o${idSeed++}`;let el=document.createElement(type==='text'?'div':'article');el.dataset.id=id;el.dataset.type=type;el.dataset.projectStage=projectStages[projectStageIndex]?.key||'Research';el.className=`object created ${type==='sticky'?'sticky '+(extra.color||'coral'):type==='text'?'text-block':'image-card'}`;el.style.left=`${x}px`;el.style.top=`${y}px`;
  if(type==='sticky')el.innerHTML='<p contenteditable="true">Write a thought...</p><footer><span>You</span><button class="note-vote">♡ <b>0</b></button></footer>';
  if(type==='text')el.innerHTML='<p contenteditable="true">Type something meaningful</p>';
  if(type==='image')el.innerHTML=`<img src="${extra.src}" alt="Uploaded canvas reference"><footer>Reference image</footer>`;
  if(extra.text&&el.querySelector('[contenteditable]'))el.querySelector('[contenteditable]').textContent=extra.text;
  canvas.append(el);bindObject(el);select(el);logActivity('Note created',`${type} added to the page`);setTimeout(()=>{if(extra.focus!==false)el.querySelector('[contenteditable]')?.focus();requestAnimationFrame(updateSelectionBar)},20);return el}
function bindObject(el){el.addEventListener('pointerdown',objectDown);el.querySelector('.note-vote')?.addEventListener('click',voteClick);el.querySelector('[contenteditable]')?.addEventListener('input',updateSelectionBar);el.addEventListener('dblclick',()=>el.querySelector('[contenteditable]')?.focus());if(el.dataset.type==='comment')el.addEventListener('click',e=>{if(!e.target.closest('button,[contenteditable]'))el.classList.toggle('open')})}
function objectDown(e){const el=e.currentTarget;if(e.button===1||spaceDown){e.preventDefault();e.stopPropagation();panState={x:e.clientX-panX,y:e.clientY-panY};canvas.classList.add('panning');return}if(e.target.closest('[contenteditable],button'))return;
  if(tool==='vote'){e.preventDefault();voteElement(el);return}
  if(tool==='comment'){e.preventDefault();addComment(el);return}
  if(tool==='connect'){e.preventDefault();handleConnect(el);return}
  if(tool!=='select')return;
  e.stopPropagation();if(!selected.has(el.dataset.id))select(el,e.shiftKey);saveHistory();const p=canvasPoint(e);const targets=[...selected].map(id=>$(`[data-id="${id}"]`)).filter(Boolean);dragState={p,targets,positions:targets.map(t=>({x:parseFloat(t.style.left)||0,y:parseFloat(t.style.top)||0}))};el.setPointerCapture(e.pointerId)}
function canvasDown(e){if(e.target!==canvas&&e.target!==connectionLayer)return;const p=canvasPoint(e);
  if(e.button===1||spaceDown){e.preventDefault();panState={x:e.clientX-panX,y:e.clientY-panY};canvas.classList.add('panning');return}
  if(tool==='sticky'&&projectStages[projectStageIndex]?.key==='Define'){openNoteEntry({stageKey:'Define'});pulseDefineLanes();notify('定义阶段请把内容添加到分类框内');return}
  if(tool==='sticky'){openNoteEntry({stageKey:projectStages[projectStageIndex]?.key||'Research',point:{x:p.x-85,y:p.y-60}});return}
  if(tool==='text'){createObject('text',p.x,p.y);notify('Text block added');return}
  if(tool==='image'){pendingImagePoint=p;$('#imageInput').click();return}
  if(tool==='comment'){createComment(p.x,p.y);return}
  if(tool==='hand'){panState={x:e.clientX-panX,y:e.clientY-panY};canvas.classList.add('panning');return}
  if(tool==='ai'){notify('Select objects first, then use AI Organise');return}
  if(tool==='select'){clearSelection();boxState={start:p,ai:false};const box=$('#selectionBox');box.classList.remove('ai-box');box.style.cssText=`display:block;left:${p.x}px;top:${p.y}px;width:0;height:0`}}
function pointerMove(e){if(panState){panX=e.clientX-panState.x;panY=e.clientY-panState.y;transform()}
  if(dragState){const p=canvasPoint(e),dx=p.x-dragState.p.x,dy=p.y-dragState.p.y;dragState.targets.forEach((t,i)=>{t.style.left=`${dragState.positions[i].x+dx}px`;t.style.top=`${dragState.positions[i].y+dy}px`});renderConnections();updateSelectionBar()}
  if(boxState){const p=canvasPoint(e),x=Math.min(p.x,boxState.start.x),y=Math.min(p.y,boxState.start.y),w=Math.abs(p.x-boxState.start.x),h=Math.abs(p.y-boxState.start.y);Object.assign($('#selectionBox').style,{left:`${x}px`,top:`${y}px`,width:`${w}px`,height:`${h}px`});if(boxState.ai){const badge=$('#aiSelectionBadge');badge.style.left=`${x}px`;badge.style.top=`${y-34}px`}}}
function pointerUp(){if(boxState){const b=$('#selectionBox').getBoundingClientRect(),large=b.width>4||b.height>4;$$('.object').filter(el=>!el.classList.contains('ai-suggestion-layer')).forEach(el=>{const r=el.getBoundingClientRect();if(large&&r.left<b.right&&r.right>b.left&&r.top<b.bottom&&r.bottom>b.top)select(el,true)});$('#selectionBox').style.display='none';$('#aiSelectionBadge').classList.add('hidden');if(selected.size){updateSelectionBar();logActivity('Marquee selection',`${selected.size} canvas object${selected.size===1?'':'s'} selected`)}else clearSelection()}if(dragState){logActivity('Notes moved',`${dragState.targets.length} selected object${dragState.targets.length===1?'':'s'} moved`);updateSelectionBar()}panState=dragState=boxState=null;canvas.classList.remove('panning')}

function voteClick(e){e.stopPropagation();voteElement(e.currentTarget.closest('.object'))}
function voteElement(el){const b=el.querySelector('.note-vote');if(!b){notify('Voting works on notes');return}const n=Number(b.querySelector('b').textContent);b.classList.toggle('voted');b.querySelector('b').textContent=b.classList.contains('voted')?n+1:Math.max(0,n-1);b.firstChild.textContent=b.classList.contains('voted')?'♥ ':'♡ ';notify(b.classList.contains('voted')?'Vote added':'Vote removed')}
function createComment(x,y){saveHistory();const el=document.createElement('div');el.className='comment-pin object created';el.dataset.id=`o${idSeed++}`;el.dataset.type='comment';el.dataset.projectStage=projectStages[projectStageIndex]?.key||'Research';el.style.left=`${x}px`;el.style.top=`${y}px`;el.innerHTML='<span>1</span><div class="comment-popover"><strong>You</strong><p contenteditable="true">Add a thoughtful comment...</p><button>Reply</button></div>';canvas.append(el);bindObject(el);el.classList.add('open');el.querySelector('p').focus();notify('Comment added')}
function addComment(target){const x=(parseFloat(target.style.left)||0)+target.offsetWidth-8,y=parseFloat(target.style.top)||0;createComment(x,y)}
function handleConnect(el){if(!connectStart){connectStart=el;el.classList.add('connect-source');notify('Now choose a second item')}else if(connectStart!==el){saveHistory();connections.push([connectStart.dataset.id,el.dataset.id]);connectStart.classList.remove('connect-source');connectStart=null;renderConnections();notify('Connection created')}}
const connections=[];
function renderConnections(){connectionLayer.innerHTML='';connections.forEach(([a,b])=>{const A=$(`[data-id="${a}"]`),B=$(`[data-id="${b}"]`);if(!A||!B)return;const x1=(parseFloat(A.style.left)||0)+A.offsetWidth/2,y1=(parseFloat(A.style.top)||0)+A.offsetHeight/2,x2=(parseFloat(B.style.left)||0)+B.offsetWidth/2,y2=(parseFloat(B.style.top)||0)+B.offsetHeight/2;const path=document.createElementNS('http://www.w3.org/2000/svg','path');const bend=Math.max(50,Math.abs(x2-x1)*.35);path.setAttribute('d',`M ${x1} ${y1} C ${x1+bend} ${y1}, ${x2-bend} ${y2}, ${x2} ${y2}`);path.setAttribute('class','connection-path');connectionLayer.append(path)})}

function setTool(btn){
  if(btn.dataset.tool==='sticky'&&projectStages[projectStageIndex]?.key==='Define'){
    const selectTool=$('[data-tool="select"]');$$('.tool').forEach(b=>b.classList.remove('active'));selectTool?.classList.add('active');tool='select';wrap.dataset.tool=tool;openNoteEntry({stageKey:'Define'});pulseDefineLanes();notify('定义阶段只在分类框内添加');return;
  }
  $$('.tool').forEach(b=>b.classList.remove('active'));btn.classList.add('active');tool=btn.dataset.tool;if(connectStart){connectStart.classList.remove('connect-source');connectStart=null}wrap.dataset.tool=tool;notify(`${btn.title}`)
}
function listHtml(items){return Array.isArray(items)&&items.length?`<ul>${items.map(x=>`<li>${escapeHtml(String(x))}</li>`).join('')}</ul>`:'<p>没有从所选内容中发现明确证据。</p>'}
async function analyse(mode='organise'){if(selected.size<1){notify('Use Select to draw around the notes first');return}workspace.classList.remove('ai-closed');$('#aiPanel').classList.remove('closed');$$('.ai-content').forEach(p=>p.classList.add('hidden'));$('#analysisView').classList.remove('hidden');$('#analysisCount').textContent=selected.size;$('#analysisLoading').classList.remove('hidden');$('#analysisLoading p').textContent='DeepSeek 正在阅读所选内容…';$('#analysisResults').classList.add('hidden');pendingAiSelection=[...selected];const selectedTexts=pendingAiSelection.map(id=>$(`[data-id="${id}"]`)?.innerText?.trim()).filter(Boolean);logActivity('AI analysis request',`${mode==='summary'?'Summary':'Reflection'} requested for ${selected.size} selected objects`);try{const response=await fetch('/api/analyse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:mode,notes:selectedTexts})});const payload=await response.json();if(!response.ok)throw Object.assign(new Error(payload.error||'AI request failed'),{code:payload.code});const a=payload.analysis||{};const result=`<section><span>DeepSeek reflection · ${escapeHtml(payload.model||'model')}</span><p>${escapeHtml(String(a.summary||'暂无总结'))}</p></section><section><span>可能的主题</span>${listHtml(a.themes)}</section><section><span>不同视角 / 潜在冲突</span>${listHtml(a.perspectives)}</section><section><span>帮助团队讨论的问题</span>${listHtml(a.questions)}</section><section><span>可选的下一步</span>${listHtml(a.next_actions)}</section><div class="analysis-note">这是基于人类所选内容的建议，不是决定。原始画布没有被移动或修改。你今天还可使用 ${payload.remaining_for_user??'—'} 次。</div><div class="analysis-actions"><button data-ai-action="discuss">Discuss</button><button data-ai-action="cancel">Close</button></div>`;$('#analysisResults').innerHTML=result;notify('DeepSeek reflection ready')}catch(err){if(err.code==='unauthorized')showAccessGate();const evidence=selectedTexts.slice(0,6).map(text=>`<li>${escapeHtml(text.replace(/\s+/g,' ').slice(0,180))}</li>`).join('');$('#analysisResults').innerHTML=`<section><span>请求未完成</span><p>${escapeHtml(err.message||'模型请求失败')}</p></section><section><span>你实际选择的内容</span><ul>${evidence||'<li>没有可读取的文字。</li>'}</ul></section><div class="analysis-note">这里不会伪造 AI 结论，也不会移动原始画布。</div><div class="analysis-actions"><button data-ai-action="cancel">Close</button></div>`}finally{$('#analysisLoading').classList.add('hidden');$('#analysisResults').classList.remove('hidden');bindAiActions($('#analysisResults'))}}
function createSuggestionLayer(chosen){saveHistory();$('.ai-suggestion-layer')?.remove();const right=Math.max(...chosen.map(el=>(parseFloat(el.style.left)||0)+el.offsetWidth))+90,top=Math.min(...chosen.map(el=>parseFloat(el.style.top)||0)),refs=chosen.map(el=>`#${el.dataset.id}`).join(', ');const layer=document.createElement('section');layer.className='object ai-suggestion-layer created';layer.dataset.id=`o${idSeed++}`;layer.dataset.type='ai-insight';layer.dataset.projectStage=projectStages[projectStageIndex]?.key||'Research';layer.style.left=`${right}px`;layer.style.top=`${top}px`;layer.innerHTML=`<header><span class="ai-face tiny"><i></i><b></b></span><div><strong>Applied organisation copy</strong><small>Original notes remain unchanged</small></div></header><div class="suggested-theme mustard"><b>01</b><span>Scattered knowledge</span></div><div class="suggested-theme coral"><b>02</b><span>Different interpretations</span></div><div class="suggested-theme mint"><b>03</b><span>Unclear next action</span></div><article><strong>Repeated ideas</strong><p>Direction and follow-through may be repeated concerns.</p><small>Source notes: ${refs}</small></article><article><strong>Insight</strong><p>Content feedback and collaboration feedback may need separate discussion.</p><small>Linked to the selected source notes</small></article><div class="canvas-ai-actions"><button data-layer-action="edit">Edit</button><button data-layer-action="discuss">Discuss</button><button data-layer-action="reject">Remove copy</button></div>`;canvas.append(layer);bindObject(layer);logActivity('Accepted suggestion',`Organisation copy created from ${chosen.length} source objects`);$$('[data-layer-action]',layer).forEach(btn=>btn.onclick=e=>{e.stopPropagation();const action=btn.dataset.layerAction;if(action==='reject'){saveHistory();layer.remove();logActivity('Rejected suggestion','Applied organisation copy removed');notify('Copy removed. Original notes remain')}else if(action==='edit'){layer.querySelectorAll('span,p').forEach(x=>x.contentEditable='true');notify('Applied copy is editable')}else{switchTab('chat');addHuman('Let’s compare the applied themes with the source notes.')}})}
function bindAiActions(root=document){$$('[data-ai-action]',root).forEach(btn=>btn.onclick=()=>{const a=btn.dataset.aiAction;if(a==='apply'){const chosen=pendingAiSelection.map(id=>$(`[data-id="${id}"]`)).filter(Boolean);if(chosen.length)createSuggestionLayer(chosen);switchTab('insights');notify('Organisation copy applied beside the originals')}if(a==='cancel'){logActivity('Rejected suggestion','AI organisation preview cancelled');switchTab('insights');notify('Preview cancelled. Canvas unchanged')}if(a==='discuss'){switchTab('chat');addHuman('Let’s discuss this organisation preview before applying it.')}if(a==='edit'){$$('.theme-chips button',root).forEach(x=>x.contentEditable='true');$('.theme-chips button',root)?.focus();notify('Category names are editable')}if(a==='why'){switchTab('chat');addAi('I suggested these categories because the selected notes repeat concerns about scattered information, different interpretations, and unclear follow-through. Does that match the team’s reading?')}})}
function switchTab(name){$$('.ai-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));['insights','chat','progress','activity'].forEach(n=>$(`#${n}Panel`).classList.toggle('hidden',n!==name));$('#analysisView').classList.add('hidden')}
function addHuman(text){const el=document.createElement('div');el.className='human-message';el.innerHTML=`<p>${escapeHtml(text)}</p><time>You · now</time>`;$('#chatPanel').append(el);$('#chatPanel').scrollTop=$('#chatPanel').scrollHeight}
function addAi(text){const el=document.createElement('div');el.className='ai-message';el.innerHTML=`<span class="ai-face tiny"><i></i><b></b></span><div><p>${text}</p><time>Now</time></div>`;$('#chatPanel').append(el);$('#chatPanel').scrollTop=$('#chatPanel').scrollHeight}
function escapeHtml(s){return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
async function showAccessGate(){if($('#accessGate'))return;const gate=document.createElement('div');gate.id='accessGate';gate.className='access-gate';gate.innerHTML=`<div class="access-card"><span class="ai-face"><i></i><b></b></span><small>INVITE-ONLY WORKSPACE</small><h2>需要邀请链接</h2><p>这个工作区不使用密码。请通过团队发给你的专属邀请链接进入。</p><em>AI 只分析团队主动选择的画布内容。</em></div>`;document.body.append(gate)}
async function initAccessGate(){try{const response=await fetch('/api/status',{cache:'no-store'});if(!response.ok)return;const status=await response.json();if(status.auth_required&&!status.authenticated)showAccessGate()}catch(err){/* Static GitHub Pages preview has no backend. */}}

const ROOM_ID=(new URLSearchParams(location.search).get('room')||'shared-direction').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,48)||'shared-direction';
const MEMBER_ID=localStorage.getItem('colab_member_id')||`member-${crypto.randomUUID?.()||Math.random().toString(36).slice(2)}`;
localStorage.setItem('colab_member_id',MEMBER_ID);
let roomRevision=0,roomStarted=false,roomObserver=null,roomSyncTimer=null,roomPollTimer=null,roomHeartbeatTimer=null,applyingRoomState=false;
let latestHardwareTranscripts=[];
const TEAM_SIZE_KEY=`colab_team_size_${ROOM_ID}`;
let teamSize=Math.max(2,Math.min(12,Number(localStorage.getItem(TEAM_SIZE_KEY))||4)),latestRoomMembers=[],latestRoomRoster=[];
const STRUCTURED_ITEMS_KEY='colab_structured_stage_items';
const emptyStructuredItems=()=>({Define:{facts:[],readings:[],signals:[]},Ideate:[]});
function normaliseStructuredItems(value){
  const clean=emptyStructuredItems(),source=value&&typeof value==='object'?value:{};
  ['facts','readings','signals'].forEach(key=>{clean.Define[key]=Array.isArray(source.Define?.[key])?source.Define[key].filter(item=>item&&typeof item.text==='string').slice(-40):[]});
  clean.Ideate=Array.isArray(source.Ideate)?source.Ideate.filter(item=>item&&typeof item.text==='string').slice(-60):[];
  return clean;
}
let structuredStageItems=(()=>{try{return normaliseStructuredItems(JSON.parse(localStorage.getItem(STRUCTURED_ITEMS_KEY)||'null'))}catch(err){return emptyStructuredItems()}})();
function persistStructuredItems(){localStorage.setItem(STRUCTURED_ITEMS_KEY,JSON.stringify(structuredStageItems))}
function memberName(){return localStorage.getItem('colab_member_name')||'访客'}
function cleanObjectHtml(el){const clone=el.cloneNode(true);clone.classList.remove('selected','connect-source','open');clone.querySelectorAll('[style*="outline"]').forEach(node=>node.style.outline='');return clone.outerHTML}
function serializeRoomState(){return{objects:$$('.object').filter(el=>!el.classList.contains('member-cursor')).map(cleanObjectHtml),connections:connections.map(pair=>[...pair]),structured_items:structuredStageItems,project_stage:projectStageIndex,session_mode:sessionModeIndex,team_size:teamSize,updated_by:memberName(),updated_at:Date.now()}}
function renderMobileNotes(){
  const list=$('#mobileNoteList');if(!list)return;
  const stageKey=projectStages?.[projectStageIndex]?.key||'Research';
  if(stageKey==='Define'){
    const items=['facts','readings','signals'].flatMap((key,index)=>structuredStageItems.Define[key].map(item=>({...item,key,color:['blue','coral','yellow'][index]})));
    list.innerHTML=items.length?items.map(item=>`<article class="mobile-note ${item.color} structured-mobile-note"><p>${escapeHtml(item.text)}</p><footer><span>${defineLaneLabels[item.key]} · ${escapeHtml(item.author||'团队')}</span><button type="button" data-remove-structured="Define:${item.key}:${item.id}">×</button></footer></article>`).join(''):'<div class="mobile-stage-empty"><strong>还没有新补充的分类内容</strong><p>请在上方的“事实 / 不同解释 / 协作信号”中选择一个分类添加。</p></div>';
    $$('[data-remove-structured]',list).forEach(btn=>btn.onclick=()=>{const [,key,id]=btn.dataset.removeStructured.split(':');structuredStageItems.Define[key]=structuredStageItems.Define[key].filter(item=>String(item.id)!==id);persistStructuredItems();renderStageExperience(projectStages[projectStageIndex]);scheduleRoomSync()});
    return;
  }
  if(stageKey==='Ideate'){
    const colors=['yellow','blue','green','coral'];
    list.innerHTML=structuredStageItems.Ideate.length?structuredStageItems.Ideate.map((item,index)=>`<article class="mobile-note ${colors[index%colors.length]} structured-mobile-note"><p>${escapeHtml(item.text)}</p><footer><span>${escapeHtml(item.author||'团队')} · 新点子</span><button type="button" data-remove-structured="Ideate:${item.id}">×</button></footer></article>`).join(''):'<div class="mobile-stage-empty"><strong>还没有新增点子</strong><p>点击“添加一个新点子”，输入完成后再创建卡片。</p></div>';
    $$('[data-remove-structured]',list).forEach(btn=>btn.onclick=()=>{const [,id]=btn.dataset.removeStructured.split(':');structuredStageItems.Ideate=structuredStageItems.Ideate.filter(item=>String(item.id)!==id);persistStructuredItems();renderStageExperience(projectStages[projectStageIndex]);scheduleRoomSync()});
    return;
  }
  const notes=$$('.sticky.object').filter(el=>!el.classList.contains('stage-object-hidden')).slice(0,30);
  list.innerHTML=notes.length?notes.map(el=>{const color=['yellow','blue','coral','green'].find(c=>el.classList.contains(c))||'yellow',text=el.querySelector('p')?.textContent||'',footer=el.querySelector('footer span')?.textContent||'',votes=el.querySelector('.note-vote b')?.textContent||'0';return`<article class="mobile-note ${color}" data-canvas-id="${el.dataset.id}"><p>${escapeHtml(text)}</p><footer><span>${escapeHtml(footer)}</span><button>♡ ${votes}</button></footer></article>`}).join(''):'<div class="mobile-stage-empty"><strong>这个阶段还没有团队便签</strong><p>点击上方加号添加第一条内容。</p></div>';
  $$('.mobile-note[data-canvas-id] footer button',list).forEach(btn=>btn.onclick=()=>{const id=btn.closest('.mobile-note').dataset.canvasId;$(`[data-id="${id}"] .note-vote`)?.click();renderMobileNotes()});
}
const memberPalette=['#d8655b','#5e7dc0','#708f65','#8a6fc4','#d28c45','#4d9290','#b75f89','#6c7482'];
function memberInitial(name='成员'){return String(name).trim().slice(0,1).toUpperCase()||'·'}
function renderLobbyMembers(roster=latestRoomRoster){
  const root=$('#joinMembers');if(!root)return;
  const onlineIds=new Set(latestRoomMembers.map(member=>member.id)),joined=roster.slice(0,teamSize),currentHasJoined=joined.some(member=>member.id===MEMBER_ID);
  const cards=joined.map((member,index)=>{const online=onlineIds.has(member.id);return{name:member.name||'成员',status:index===0?(online?'主持人 · 已在线':'主持人 · 暂时离线'):(online?'组员 · 已在线':'组员 · 暂时离线'),online,current:member.id===MEMBER_ID,vacant:false,color:memberPalette[index%memberPalette.length],avatar:memberInitial(member.name)}});
  if(!currentHasJoined&&cards.length<teamSize)cards.push({name:$('#joinName')?.value.trim()||'等待加入',status:'加入后显示在团队中',online:false,current:true,vacant:true,color:'#23262d',avatar:'你'});
  while(cards.length<teamSize){const seat=cards.length+1;cards.push({name:'等待成员',status:'空位',online:false,current:false,vacant:true,color:'#9b9fa5',avatar:String(seat)})}
  root.innerHTML=cards.map(card=>`<article class="${card.vacant?'waiting':card.online?'':'offline'}${card.current?' current':''}"><span class="join-avatar" style="background:${card.color}">${escapeHtml(card.avatar)}</span><div><strong>${escapeHtml(card.name)}</strong><small>${card.status}</small></div><i></i></article>`).join('');
  if(currentLanguage==='en')translateInterface(root);
}
function renderTeamSize(){
  const onlineCount=latestRoomMembers.length;
  if($('#teamSizeValue'))$('#teamSizeValue').textContent=String(teamSize);
  if($('#joinTeamSizeMetric'))$('#joinTeamSizeMetric').textContent=String(teamSize);
  if($('#joinOnlineMetric'))$('#joinOnlineMetric').textContent=`${onlineCount} / ${teamSize}`;
  if($('#presenceOnlineMetric'))$('#presenceOnlineMetric').textContent=`${onlineCount} / ${teamSize}`;
  if($('#mobileOnlineMetric'))$('#mobileOnlineMetric').textContent=`${onlineCount} / ${teamSize}`;
}
function setTeamSize(value,{persist=true,sync=false}={}){
  teamSize=Math.max(latestRoomRoster.length,latestRoomMembers.length,Math.max(2,Math.min(12,Number(value)||4)));
  if(persist)localStorage.setItem(TEAM_SIZE_KEY,String(teamSize));
  renderTeamSize();renderLobbyMembers();
  if(sync&&roomStarted)scheduleRoomSync();
}
function updateRoomMembers(members=[],roster=latestRoomRoster){
  const seen=new Set();
  latestRoomMembers=members.filter(member=>member?.id&&!seen.has(member.id)&&seen.add(member.id));
  if(Array.isArray(roster)){
    const rosterSeen=new Set();
    latestRoomRoster=roster.filter(member=>member?.id&&!rosterSeen.has(member.id)&&rosterSeen.add(member.id));
  }
  if(Math.max(latestRoomMembers.length,latestRoomRoster.length)>teamSize)setTeamSize(Math.max(latestRoomMembers.length,latestRoomRoster.length));
  const count=latestRoomMembers.length,names=latestRoomMembers.map(member=>member.name).join('、');
  const presence=$('.presence');
  if(presence)presence.setAttribute('aria-label',`${count} 人在线${names?`：${names}`:''}`);
  const avatars=$('#presenceAvatars');
  if(avatars){
    avatars.innerHTML=latestRoomMembers.slice(0,3).map((member,index)=>`<span class="avatar" style="background:${memberPalette[index%memberPalette.length]}" title="${escapeHtml(member.name||'成员')}">${escapeHtml(memberInitial(member.name))}</span>`).join('');
    if(count>3)avatars.insertAdjacentHTML('beforeend',`<span class="avatar count">+${count-3}</span>`);
  }
  const mobile=$('.mobile-online');if(mobile)mobile.setAttribute('aria-label',`${count} / ${teamSize} 人在线`);
  renderTeamSize();renderLobbyMembers();
}
function renderHardwareTranscripts(records=[]){
  latestHardwareTranscripts=Array.isArray(records)?records.filter(record=>record.speaker!=='联动检查').slice(-100):[];
  let panel=$('#hardwareTranscriptPanel');
  if(!panel){
    panel=document.createElement('section');
    panel.id='hardwareTranscriptPanel';
    panel.className='hardware-transcript-panel';
    panel.innerHTML='<header><div><strong>ESP32 发言记录</strong><small>语音识别后自动同步到这个房间</small></div><button type="button" id="summariseHardwareBtn">总结发言</button></header><div id="hardwareTranscriptList"></div>';
    $('#chatPanel').prepend(panel);
    $('#summariseHardwareBtn').onclick=summariseHardwareTranscripts;
  }
  const list=$('#hardwareTranscriptList');
  if(!latestHardwareTranscripts.length){
    list.innerHTML='<p class="hardware-transcript-empty">等待 ESP32 发送第一条发言……</p>';
    return;
  }
  list.innerHTML=latestHardwareTranscripts.map(record=>{
    const stamp=record.created_at?new Date(record.created_at*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
    const kindLabel={question:'提问',answer:'成员观点',feedback:'Pip 反馈'}[record.kind]||'成员观点';
    return `<article><div><strong>${escapeHtml(String(record.speaker||'ESP32'))} · ${kindLabel}</strong><time>${escapeHtml(stamp)}</time></div><p>${escapeHtml(String(record.text||''))}</p></article>`;
  }).join('');
  syncHardwareStickyNotes(latestHardwareTranscripts);
}
function syncHardwareStickyNotes(records=[]){
  let changed=false;
  const answers=records.filter(record=>(record.kind||'answer')==='answer'&&record.text);
  answers.forEach((record,index)=>{
    const transcriptId=String(record.id||`${record.created_at}-${index}`);
    const safeId=transcriptId.replace(/[^a-zA-Z0-9_-]/g,'').slice(-54);
    const existing=$(`[data-id="hardware-${safeId}"]`);
    if(existing){
      if(existing.dataset.projectStage!=='Research'){existing.dataset.projectStage='Research';changed=true}
      existing.classList.toggle('stage-object-hidden',projectStages[projectStageIndex]?.key!=='Research');
      return;
    }
    const el=document.createElement('article');
    el.dataset.id=`hardware-${safeId}`;
    el.dataset.type='sticky';
    el.dataset.hardwareTranscriptId=transcriptId;
    el.dataset.projectStage='Research';
    el.className=`object created sticky ${['yellow','blue','green','coral'][index%4]} hardware-sticky`;
    el.style.left=`${180+(index%4)*230}px`;
    el.style.top=`${1050+Math.floor(index/4)*165}px`;
    const stamp=record.created_at?new Date(record.created_at*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
    el.innerHTML=`<p contenteditable="true">${escapeHtml(String(record.text))}</p><footer><span>${escapeHtml(String(record.speaker||'成员'))} · ${escapeHtml(stamp)}</span><button class="note-vote">♡ <b>0</b></button></footer>`;
    el.classList.toggle('stage-object-hidden',projectStages[projectStageIndex]?.key!=='Research');
    canvas.append(el);bindObject(el);changed=true;
  });
  if(changed){renderMobileNotes();logActivity('ESP32 evidence updated',`${answers.length} hardware viewpoints are stored in the Research stage`);if(roomStarted)scheduleRoomSync()}
}
async function summariseHardwareTranscripts(){
  const notes=latestHardwareTranscripts.map(record=>`${record.speaker||'成员'}：${record.text||''}`).filter(Boolean);
  if(!notes.length){notify('还没有收到 ESP32 发言');return}
  const button=$('#summariseHardwareBtn');button.disabled=true;button.textContent='总结中…';
  try{
    const response=await fetch('/api/analyse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:'请客观总结这些由 ESP32 收集的小组成员发言，归纳共同观点、不同意见和仍需讨论的问题，不替团队作决定。',notes})});
    const payload=await response.json();
    if(!response.ok)throw new Error(payload.error||'总结失败');
    const a=payload.analysis||{};
    switchTab('chat');
    addAi(`<strong>小组发言总结</strong><br>${escapeHtml(String(a.summary||'暂无总结'))}<br><br><strong>仍可讨论：</strong><br>${(a.questions||[]).map(x=>`• ${escapeHtml(String(x))}`).join('<br>')}`);
    notify('DeepSeek 已完成小组发言总结');
  }catch(err){notify(err.message||'总结失败')}finally{button.disabled=false;button.textContent='总结发言'}
}
function observeRoomCanvas(){
  roomObserver?.disconnect();
  roomObserver=new MutationObserver(mutations=>{
    if(applyingRoomState)return;
    const meaningful=mutations.some(m=>m.type==='characterData'||m.target.closest?.('.object')||m.target.classList?.contains('object')||m.target===canvas);
    if(meaningful)scheduleRoomSync();
  });
  roomObserver.observe(canvas,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['style','class']});
}
function applyRoomState(state){
  if(!state?.objects||dragState||document.activeElement?.closest?.('.object [contenteditable]'))return false;
  applyingRoomState=true;roomObserver?.disconnect();
  if(Number.isInteger(state.team_size))setTeamSize(state.team_size);
  restore(state.objects);
  connections.splice(0,connections.length,...(Array.isArray(state.connections)?state.connections:[]));
  if(state.structured_items){structuredStageItems=normaliseStructuredItems(state.structured_items);persistStructuredItems()}
  if(Number.isInteger(state.project_stage)&&state.project_stage!==projectStageIndex)setProjectStage(state.project_stage);
  if(Number.isInteger(state.session_mode)&&state.session_mode!==sessionModeIndex)setSessionMode(state.session_mode);
  renderConnections();renderStageExperience(projectStages[projectStageIndex]);renderMobileNotes();
  applyingRoomState=false;observeRoomCanvas();
  return true;
}
async function roomRequest(path,body){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:ROOM_ID,member_id:MEMBER_ID,name:memberName(),...body})});
  if(!response.ok)throw new Error('room request failed');
  return response.json();
}
async function pushRoomState(){
  if(!roomStarted||applyingRoomState)return;
  try{const payload=await roomRequest('/api/room/state',{state:serializeRoomState()});roomRevision=payload.revision;updateRoomMembers(payload.members,payload.roster)}catch(err){/* The static preview has no room server. */}
}
function scheduleRoomSync(){clearTimeout(roomSyncTimer);roomSyncTimer=setTimeout(pushRoomState,450)}
async function pollRoom(){
  if(!roomStarted)return;
  try{
    const response=await fetch(`/api/room?room=${encodeURIComponent(ROOM_ID)}`,{cache:'no-store'});
    if(!response.ok)return;
    const payload=await response.json();updateRoomMembers(payload.members,payload.roster);
    if(payload.revision>roomRevision&&applyRoomState(payload.state))roomRevision=payload.revision;
    renderHardwareTranscripts(payload.hardware_transcripts);
  }catch(err){/* Keep the local canvas usable while offline. */}
}
async function loadRoomPreview(){
  try{
    const response=await fetch(`/api/room?room=${encodeURIComponent(ROOM_ID)}`,{cache:'no-store'});
    if(!response.ok)return;
    const payload=await response.json();
    if(Number.isInteger(payload.state?.team_size))setTeamSize(payload.state.team_size);
    updateRoomMembers(payload.members||[],payload.roster||[]);renderHardwareTranscripts(payload.hardware_transcripts||[]);
  }catch(err){renderTeamSize();renderLobbyMembers()}
}
async function initRealtimeRoom(){
  if(roomStarted)return;
  roomStarted=true;observeRoomCanvas();renderMobileNotes();
  try{
    const payload=await roomRequest('/api/room/join',{});
    updateRoomMembers(payload.members,payload.roster);
    if(payload.state){applyRoomState(payload.state);roomRevision=payload.revision}else await pushRoomState();
    renderHardwareTranscripts(payload.hardware_transcripts||[]);
    roomPollTimer=setInterval(pollRoom,1300);
    roomHeartbeatTimer=setInterval(()=>roomRequest('/api/room/join',{}).then(p=>updateRoomMembers(p.members,p.roster)).catch(()=>{}),10000);
  }catch(err){roomStarted=false}
}

$$('.object').forEach(bindObject);$$('.tool[data-tool]').forEach(btn=>btn.onclick=()=>setTool(btn));$('[data-tool="ai"]').onclick=()=>analyse('organise');canvas.addEventListener('pointerdown',canvasDown);window.addEventListener('pointermove',pointerMove);window.addEventListener('pointerup',pointerUp);
wrap.addEventListener('wheel',e=>{
  e.preventDefault();
  const unit=e.deltaMode===1?16:e.deltaMode===2?wrap.clientHeight:1;
  if(e.ctrlKey||e.metaKey){
    const before=canvasPoint(e),factor=Math.exp(-e.deltaY*unit*.0022),r=wrap.getBoundingClientRect();
    zoom=Math.max(.35,Math.min(1.8,zoom*factor));panX=e.clientX-r.left-before.x*zoom;panY=e.clientY-r.top-before.y*zoom;
  }else{
    const horizontal=e.shiftKey&&!e.deltaX?e.deltaY:e.deltaX;
    panX-=horizontal*unit;panY-=e.shiftKey&&!e.deltaX?0:e.deltaY*unit;
  }
  transform();
},{passive:false});
$('#zoomIn').onclick=()=>{zoom=Math.min(1.8,zoom+.1);transform()};$('#zoomOut').onclick=()=>{zoom=Math.max(.35,zoom-.1);transform()};$('#fitCanvas').onclick=()=>{zoom=.72;panX=10;panY=0;transform()};$('#clearSelection').onclick=clearSelection;$('#analyseBtn').onclick=analyse;
$('#undoBtn').onclick=undo;$('#redoBtn').onclick=redo;
function deleteSelected(){if(!selected.size)return;saveHistory();const count=selected.size;[...selected].forEach(id=>$(`[data-id="${id}"]`)?.remove());connections.splice(0,connections.length,...connections.filter(([a,b])=>!selected.has(a)&&!selected.has(b)));clearSelection();renderConnections();logActivity('Notes deleted',`${count} selected object${count===1?'':'s'} deleted`);notify('Selection deleted')}
$('#deleteSelectionBtn').onclick=deleteSelected;$('#summariseSelectionBtn').onclick=()=>analyse('summary');$('#moveBtn').onclick=()=>notify('Drag any selected note to move the full selection');
$('#duplicateBtn').onclick=()=>{const count=selected.size;[...selected].forEach(id=>{const src=$(`[data-id="${id}"]`);if(src?.dataset.type==='sticky')createObject('sticky',(parseFloat(src.style.left)||0)+30,(parseFloat(src.style.top)||0)+30,{color:[...src.classList].find(c=>['yellow','green','blue','coral'].includes(c))})});logActivity('Notes created',`${count} selected object${count===1?'':'s'} duplicated`);notify('Selection duplicated')};
$('#groupBtn').onclick=()=>{logActivity('Notes grouped',`${selected.size} selected objects grouped for movement`);notify('Selection grouped for movement')};
$('#imageInput').onchange=e=>{const file=e.target.files[0];if(!file)return;const reader=new FileReader();reader.onload=()=>{createObject('image',(pendingImagePoint?.x||400)-110,(pendingImagePoint?.y||300)-80,{src:reader.result});notify('Image added to canvas')};reader.readAsDataURL(file);e.target.value=''};
$$('.note-vote').forEach(b=>b.onclick=voteClick);
$$('.ai-tabs button').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));bindAiActions();
$('#aiToggle').onclick=()=>{workspace.classList.toggle('ai-closed');$('#aiPanel').classList.toggle('closed')};$('#closeAI').onclick=()=>{workspace.classList.add('ai-closed');$('#aiPanel').classList.add('closed')};
$('#closeAnalysis').onclick=()=>switchTab('insights');
$('#aiForm').onsubmit=async e=>{e.preventDefault();const input=$('#aiPrompt'),value=input.value.trim();if(!value)return;const context=[...selected].map(id=>$(`[data-id="${id}"]`)?.innerText?.trim()).filter(Boolean);switchTab('chat');addHuman(value);input.value='';addAi('正在阅读你主动选择的内容…');const pending=$('#chatPanel .ai-message:last-child');try{const response=await fetch('/api/analyse',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:`回答团队问题：${value}`,notes:context.length?context:[value]})});const payload=await response.json();if(!response.ok)throw new Error(payload.error||'AI request failed');const a=payload.analysis||{};pending?.remove();addAi(`${escapeHtml(String(a.summary||''))}<br><br><strong>可以一起讨论：</strong><br>${(a.questions||[]).map(x=>`• ${escapeHtml(String(x))}`).join('<br>')}`)}catch(err){pending?.remove();addAi('模型还没有连接成功。请确认使用 server.py 启动，并在启动前设置 DEEPSEEK_API_KEY。')}};
$$('.quick-ai').forEach(btn=>btn.onclick=()=>{const label=btn.dataset.quick;if(label==='Summarise'){if(selected.size)analyse();else notify('Select the content you want summarised')}else{switchTab('chat');addAi('What is the team trying to decide next? Select the relevant notes so I can respond with context.')}});
$$('[data-prompt]').forEach(b=>b.onclick=()=>{$('#aiPrompt').value=b.dataset.prompt;$('#aiPrompt').focus()});
$('#attachBtn').onclick=()=>{pendingImagePoint={x:1040,y:690};$('#imageInput').click()};
let recording=false,mediaRecorder=null,recordedChunks=[],recordingStream=null,recordingSeconds=0,recordingTicker=null;
function recordingTime(){return`${String(Math.floor(recordingSeconds/60)).padStart(2,'0')}:${String(recordingSeconds%60).padStart(2,'0')}`}
function setRecordingUI(active){$('#recordingStatus').classList.toggle('hidden',!active);$('#mobileRecordingSheet').classList.toggle('hidden',!active);$('#voiceBtn').classList.toggle('recording',active);$('#voiceFab').classList.toggle('recording',active);$('#voiceBtn span')?.replaceChildren(active?'停止':'语音');if(active){recordingSeconds=0;$('#recordingTimer').textContent='00:00';$('#mobileRecordingTimer').textContent='00:00';clearInterval(recordingTicker);recordingTicker=setInterval(()=>{recordingSeconds++;$('#recordingTimer').textContent=recordingTime();$('#mobileRecordingTimer').textContent=recordingTime()},1000)}else{clearInterval(recordingTicker);recordingTicker=null}}
const RECORDING_DB='colab-recordings',RECORDING_STORE='recordings';
function openRecordingDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(RECORDING_DB,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(RECORDING_STORE))request.result.createObjectStore(RECORDING_STORE,{keyPath:'id'})};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function recordingStore(mode,action){const db=await openRecordingDb();return new Promise((resolve,reject)=>{const tx=db.transaction(RECORDING_STORE,mode),store=tx.objectStore(RECORDING_STORE),request=action(store);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close()})}
const saveRecording=record=>recordingStore('readwrite',store=>store.put(record));
const loadRecordings=()=>recordingStore('readonly',store=>store.getAll());
const deleteRecording=id=>recordingStore('readwrite',store=>store.delete(id));
const clearRecordings=()=>recordingStore('readwrite',store=>store.clear());
function updateVoiceCount(){const count=$$('.mobile-voice-note').length;const target=$('#mobileVoiceCount');if(target)target.textContent=String(count)}
function renderVoiceNote(record){if($(`[data-recording-id="${record.id}"]`))return;const url=URL.createObjectURL(record.blob),el=document.createElement('div');el.className='voice-note';el.dataset.recordingId=record.id;el.innerHTML=`<div><strong>团队语音记录 · ${record.duration}</strong><small>讨论 · 已保存在此设备 · ${record.stamp}</small></div><audio controls src="${url}"></audio><div class="voice-note-actions"><a download="${record.fileName}" href="${url}">下载</a><button class="delete-recording" type="button">删除</button></div>`;$('#chatPanel').append(el);const mobile=$('[data-mobile-view="discuss"]');mobile.querySelector('.mobile-discussion-empty')?.remove();const mobileEl=document.createElement('article');mobileEl.className='mobile-voice-note';mobileEl.dataset.recordingId=record.id;mobileEl.innerHTML=`<div><strong>团队语音记录</strong><small>${record.stamp} · ${record.duration} · 本机保存</small></div><audio controls src="${url}"></audio><div><a download="${record.fileName}" href="${url}">下载</a><button class="delete-recording" type="button">删除</button></div>`;mobile.append(mobileEl);const remove=async()=>{await deleteRecording(record.id);$$(`[data-recording-id="${record.id}"]`).forEach(node=>node.remove());URL.revokeObjectURL(url);updateVoiceCount();if(!mobile.querySelector('.mobile-voice-note'))mobile.insertAdjacentHTML('beforeend','<div class="mobile-discussion-empty"><span>●</span><strong>还没有语音记录</strong><p>录音结束后会保存在这里，刷新页面也不会消失。</p></div>');notify('这条录音已从当前设备删除')};el.querySelector('.delete-recording').onclick=remove;mobileEl.querySelector('.delete-recording').onclick=remove;updateVoiceCount()}
async function addVoiceNote(blob){const id=Date.now(),record={id,blob,stamp:new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}),duration:recordingTime(),fileName:`colab-voice-${id}.webm`};try{await saveRecording(record);renderVoiceNote(record);switchTab('chat');$('#chatPanel').scrollTop=$('#chatPanel').scrollHeight;logActivity('Voice note recorded','语音已保存在当前设备的讨论记录中');notify('录音已保存到“讨论”，刷新后仍可播放')}catch(err){notify('录音保存失败，请下载后保留')}}
async function voice(){if(recording&&mediaRecorder){mediaRecorder.stop();return}if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){notify('当前浏览器不支持录音');return}try{recordingStream=await navigator.mediaDevices.getUserMedia({audio:true});recordedChunks=[];mediaRecorder=new MediaRecorder(recordingStream);mediaRecorder.ondataavailable=e=>{if(e.data.size)recordedChunks.push(e.data)};mediaRecorder.onstop=()=>{const blob=new Blob(recordedChunks,{type:mediaRecorder.mimeType||'audio/webm'});recordingStream?.getTracks().forEach(track=>track.stop());recordingStream=null;recording=false;setRecordingUI(false);addVoiceNote(blob);notify('录音已保存到“讨论”，可播放或下载')};mediaRecorder.start();recording=true;setRecordingUI(true);notify('正在录音；顶部会显示时长和保存位置')}catch(err){recording=false;setRecordingUI(false);notify(err?.name==='NotAllowedError'?'没有获得麦克风权限':'无法开始录音')}}
$('#voiceBtn').onclick=voice;$('#voiceFab').onclick=voice;$('#recordingStopBtn').onclick=voice;$('#mobileVoiceBtn').onclick=voice;$('#mobileStopRecording').onclick=voice;
$('#deleteAllRecordings').onclick=async()=>{
  const count=$$('.mobile-voice-note').length;
  if(!count){notify('当前浏览器没有保存录音');return}
  if(!confirm(`确定删除当前浏览器保存的 ${count} 条录音吗？删除后无法恢复。`))return;
  try{
    await clearRecordings();
    $$('[data-recording-id]').forEach(node=>node.remove());
    updateVoiceCount();
    const mobile=$('[data-mobile-view="discuss"]');
    if(!mobile.querySelector('.mobile-discussion-empty'))mobile.insertAdjacentHTML('beforeend','<div class="mobile-discussion-empty"><span>●</span><strong>还没有语音记录</strong><p>录音结束后会保存在当前浏览器，可在“我的”中全部清空。</p></div>');
    notify('当前浏览器保存的录音已全部删除');
  }catch(err){notify('删除失败，请在浏览器的网站数据设置中清除 CoLab 数据')}
};
$('#projectSwitcher').onclick=$('#homeBtn').onclick=()=>$('#projectDialog').showModal();$('.dialog-close').onclick=()=>$('#projectDialog').close();$('#newProjectBtn').onclick=()=>{saveHistory();$$('.object').forEach(el=>el.remove());connections.splice(0);renderConnections();clearSelection();$('#projectDialog').close();notify('Blank page created. Build your own structure')};
const projectStages=[
  {key:'Research',number:'01 / 05',label:'研究阶段',title:'收集事实，而不是急着下结论',entry:'项目问题已经建立，团队准备收集资料。',goal:'记录来源、观察、访谈与导师反馈。',exit:'已有足够证据，可以描述主要模式。',next:'定义',canvas:'为什么我们的项目会失去方向？',journey:'收集证据',compose:'添加一个观察',composeHint:'可输入文字或让机器人按固定路径收集语音',robotPosition:'起点',robotTask:'按座位顺序收集观察',robotMessage:'主持人确认后，Pip 沿 A-B-C-D 固定路径依次收集成员观点。'},
  {key:'Define',number:'02 / 05',label:'定义阶段',title:'把证据转化为共同的问题',entry:'研究材料已具备，并能看到初步模式。',goal:'区分事实、解释和协作过程中的信号。',exit:'团队确认了一个清晰的问题陈述。',next:'构思',canvas:'我们真正需要解决的问题是什么？',journey:'明确挑战',compose:'补充一条证据',composeHint:'AI 只分析团队主动框选的材料',robotPosition:'成员 B',robotTask:'朗读冲突观点并询问确认',robotMessage:'Pip 停在发言者附近，读出两种不同理解，由团队确认问题表述。'},
  {key:'Ideate',number:'03 / 05',label:'构思阶段',title:'先发散，再由团队决定如何归类',entry:'问题陈述已由团队共同确认。',goal:'产生多种方向，框选后再请求 AI 提供分类建议。',exit:'团队选出值得进一步发展的方向。',next:'开发',canvas:'哪些可能性值得我们继续探索？',journey:'发散与归类',compose:'添加一个新点子',composeHint:'先自由发散，稍后再分类和投票',robotPosition:'桌面中心',robotTask:'邀请安静成员补充点子',robotMessage:'当讨论重复或停滞时，Pip 只提出问题并邀请更多成员参与。'},
  {key:'Develop',number:'04 / 05',label:'开发阶段',title:'把方向变成可以测试的原型',entry:'已有明确方向和成功标准。',goal:'制作原型、分配任务并记录真实测试反馈。',exit:'原型经过至少一轮真实测试。',next:'回顾',canvas:'我们怎样快速验证这个方向？',journey:'制作与测试',compose:'记录一条测试反馈',composeHint:'标记观察、问题和下一版修改',robotPosition:'测试位 C',robotTask:'播报测试步骤与计时提醒',robotMessage:'Pip 沿固定轨道到测试位，播报当前任务和剩余时间，不替团队评价结果。'},
  {key:'Review',number:'05 / 05',label:'回顾阶段',title:'总结学习，并由人确认下一步',entry:'原型和测试反馈已经汇总。',goal:'确认有效部分、风险、未解决问题和负责人。',exit:'团队确认下一轮行动和负责人。',next:'研究',canvas:'这次协作让我们学到了什么？',journey:'共同反思',compose:'补充一条反思',composeHint:'记录学习，不用于成员排名',robotPosition:'总结输出位',robotTask:'语音播报已确认的行动',robotMessage:'只有团队确认总结后，Pip 才会播报下一步或连接打印设备输出摘要。'}
];
const stageSceneTemplates={
  Research:()=>`<aside class="robot-route-panel research-route"><header><span class="stage-mini-icon">P</span><div><strong>实体协作路径</strong><small>等待主持人开始</small></div></header><div class="route-ring"><i class="route-seat seat-a">A</i><i class="route-seat seat-b">B</i><i class="route-seat seat-c">C</i><i class="route-seat seat-d">D</i><b class="route-robot">Pip</b></div><p>固定轨迹连接四个座位。机器人按顺序收集语音，不会在桌面自由移动。</p><button data-stage-action="robot">预览收集路径</button></aside>`,
  Define:()=>`<div class="define-board stage-board"><section class="evidence-lane facts" data-define-lane="facts"><header><span>事实</span><div><b data-lane-count>3</b><button data-define-add="facts" aria-label="添加事实">＋ 添加</button></div></header><article>资料分散在多个平台</article><article>会议结束后没有行动记录</article><article>成员引用了不同版本的反馈</article><div class="structured-lane-items" data-structured-lane="facts"></div></section><section class="evidence-lane readings" data-define-lane="readings"><header><span>不同解释</span><div><b data-lane-count>2</b><button data-define-add="readings" aria-label="添加不同解释">＋ 添加</button></div></header><article>导师希望我们缩小主题</article><article>导师希望我们调整协作方法</article><div class="structured-lane-items" data-structured-lane="readings"></div></section><section class="evidence-lane signals" data-define-lane="signals"><header><span>协作信号</span><div><b data-lane-count>2</b><button data-define-add="signals" aria-label="添加协作信号">＋ 添加</button></div></header><article>同一话题重复出现</article><article>两位成员尚未表达观点</article><div class="structured-lane-items" data-structured-lane="signals"></div></section><section class="problem-frame"><small>团队正在确认的问题陈述</small><h2>我们怎样让分散反馈变成团队共同理解，并明确下一步？</h2><p>这句话仍可编辑。AI 只指出所选材料中的冲突，不会替团队定稿。</p><button data-stage-action="confirm">确认后进入构思</button></section><aside class="robot-step-card"><span>Pip 在成员 B</span><strong>“你们说的是内容问题，还是协作过程问题？”</strong><p>机器人朗读问题，等待成员讨论。</p></aside></div>`,
  Ideate:()=>`<div class="ideate-board stage-board"><section class="idea-field"><header><div><small>自由发散区</small><strong>先增加可能性，不急着整理</strong></div><button data-stage-action="add">＋ 添加点子</button></header><div class="idea-cloud"><article class="idea-a">会议后自动生成行动清单</article><article class="idea-b">用颜色区分反馈来源</article><article class="idea-c">让机器人邀请安静成员</article><article class="idea-d">给每个决定保留来源链接</article><article class="idea-e">用桌面轨迹代表讨论节奏</article><article class="idea-f">阶段结束前进行快速投票</article></div><div class="idea-added-list" data-structured-ideas></div></section><section class="category-preview"><header><div><small>团队框选后</small><strong>分类建议预览</strong></div><span>尚未应用</span></header><div class="category-row"><b>信息结构</b><p>来源、行动记录、决定链接</p></div><div class="category-row"><b>参与方式</b><p>邀请发言、快速投票</p></div><div class="category-row"><b>实体交互</b><p>固定路径、语音提醒</p></div><footer><button data-stage-action="discuss">讨论分类</button><button data-stage-action="apply">由团队确认分类</button></footer></section><aside class="robot-step-card"><span>Pip 在桌面中心</span><strong>“还有谁有完全不同的方向？”</strong><p>它只提出问题，不移动便签。</p></aside></div>`,
  Develop:()=>`<div class="develop-board stage-board"><section class="prototype-hero"><div><small>当前原型</small><h2>固定轨迹协作机器人</h2><p>网页管理讨论内容，小车负责到达指定成员、收集语音并播报提醒。</p></div><div class="prototype-device"><b>Pip</b><span>屏幕 + 语音</span></div></section><section class="test-column"><header><strong>本轮测试</strong><span>进行中</span></header><label><input type="checkbox" checked disabled> 识别四个固定座位</label><label><input type="checkbox" checked disabled> 到成员 B 后停止</label><label><input type="checkbox" disabled> 录音同步到讨论区</label><label><input type="checkbox" disabled> 播报下一步提醒</label></section><section class="feedback-column"><header><strong>现场反馈</strong><button data-stage-action="test">记录反馈</button></header><article><b>有效</b><p>固定路径让移动更容易理解。</p></article><article><b>待改进</b><p>需要在网页显示机器人下一站。</p></article></section><section class="route-test"><small>桌面固定路径</small><div class="route-line"><i>A</i><i>B</i><b>Pip</b><i>C</i><i>D</i></div><p>当前位置：测试位 C。下一站需要主持人确认。</p></section></div>`,
  Review:()=>`<div class="review-board stage-board"><section class="outcome-summary"><header><div><small>协作结果草稿</small><strong>等待团队确认</strong></div><span>Pip 总结预览</span></header><h2>固定空间与固定轨迹，让实体 AI 的参与更可控。</h2><p>双轮小车负责移动和提醒，显示屏负责表情与语音。网站记录材料、讨论与人类确认的决定。</p></section><section class="review-grid"><article><small>已确认</small><strong>双轮底盘 + 独立显示屏</strong><p>体积更适合桌面场景。</p></article><article><small>关键风险</small><strong>录音与成员位置同步</strong><p>需要在真实设备上继续验证。</p></article><article><small>未解决</small><strong>小车如何识别下一位成员</strong><p>先使用固定座位编号。</p></article><article><small>下一步</small><strong>连接 ESP32 屏幕与网页</strong><p>负责人：王雨堃</p></article></section><section class="review-actions"><div><small>机器人输出</small><strong>语音播报 + 可选打印摘要</strong></div><button data-stage-action="review">团队确认下一步</button></section><aside class="robot-step-card"><span>Pip 在总结输出位</span><strong>等待团队确认后播报</strong><p>未确认的 AI 建议不会进入项目结论。</p></aside></div>`
};
const mobileStageTemplates={
  Research:()=>`<div class="mobile-stage-mode research"><header><span>当前工作</span><strong>收集不同成员的观察</strong></header><div class="mobile-route-mini"><i>A</i><i>B</i><b>Pip</b><i>C</i><i>D</i></div><p>机器人按固定路径到成员位置，主持人确认后开始录音。</p></div>`,
  Define:()=>`<div class="mobile-stage-mode define"><header><span>问题定义</span><strong>内容必须进入明确分类</strong></header><div class="mobile-define-lanes"><button data-define-add="facts"><span><b>事实</b><small>可验证资料</small></span><i>＋</i></button><button data-define-add="readings"><span><b>不同解释</b><small>成员理解</small></span><i>＋</i></button><button data-define-add="signals"><span><b>协作信号</b><small>重复与停滞</small></span><i>＋</i></button></div><button data-stage-action="confirm">查看共同问题陈述</button></div>`,
  Ideate:()=>`<div class="mobile-stage-mode ideate"><header><span>发散与归类</span><strong>先写好内容，再生成点子卡片</strong></header><div class="mobile-category-strip"><i>信息结构</i><i>参与方式</i><i>实体交互</i></div><p>点击下方“添加一个新点子”会先打开输入框，不会直接生成空白标签。</p><button data-stage-action="apply">由团队确认分类</button></div>`,
  Develop:()=>`<div class="mobile-stage-mode develop"><header><span>原型测试</span><strong>固定轨迹协作机器人</strong></header><div class="mobile-test-status"><b>2 / 4</b><span>测试项已完成</span></div><p>当前位置：测试位 C。下一站需要主持人确认。</p><button data-stage-action="test">记录一次反馈</button></div>`,
  Review:()=>`<div class="mobile-stage-mode review"><header><span>回顾总结</span><strong>由团队确认结论与负责人</strong></header><div class="mobile-summary-lines"><p>已确认：双轮底盘与独立显示屏</p><p>下一步：连接 ESP32 屏幕与网页</p></div><button data-stage-action="review">确认下一步</button></div>`
};
let projectStageIndex=0;
let noteEntryState={stageKey:'Research',lane:null,point:null};
const defineLaneLabels={facts:'事实',readings:'不同解释',signals:'协作信号'};
function renderStructuredStageItems(){
  ['facts','readings','signals'].forEach(key=>{
    const list=$(`[data-structured-lane="${key}"]`);
    if(list)list.innerHTML=structuredStageItems.Define[key].map(item=>`<article class="structured-item"><span>${escapeHtml(item.text)}</span><button type="button" data-remove-structured="Define:${key}:${item.id}" aria-label="删除">×</button></article>`).join('');
    const lane=$(`[data-define-lane="${key}"]`),count=lane?.querySelector('[data-lane-count]');
    if(count)count.textContent=String(Number({facts:3,readings:2,signals:2}[key])+structuredStageItems.Define[key].length);
  });
  const ideas=$('[data-structured-ideas]');
  if(ideas)ideas.innerHTML=structuredStageItems.Ideate.map((item,index)=>`<article class="structured-idea idea-tone-${index%4}"><span>${escapeHtml(item.text)}</span><button type="button" data-remove-structured="Ideate:${item.id}" aria-label="删除">×</button></article>`).join('');
  $$('[data-remove-structured]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();const [stage,key,id]=btn.dataset.removeStructured.split(':');
    if(stage==='Define')structuredStageItems.Define[key]=structuredStageItems.Define[key].filter(item=>String(item.id)!==id);
    else structuredStageItems.Ideate=structuredStageItems.Ideate.filter(item=>String(item.id)!==key);
    persistStructuredItems();renderStageExperience(projectStages[projectStageIndex]);scheduleRoomSync();notify('内容已删除');
  });
}
function pulseDefineLanes(){
  $$('.evidence-lane').forEach(lane=>lane.classList.remove('add-hint'));
  requestAnimationFrame(()=>{$$('.evidence-lane').forEach(lane=>lane.classList.add('add-hint'));setTimeout(()=>$$('.evidence-lane').forEach(item=>item.classList.remove('add-hint')),1200)});
}
function openNoteEntry({stageKey=projectStages[projectStageIndex]?.key||'Research',lane=null,point=null}={}){
  const dialog=$('#noteEntryDialog'),input=$('#noteEntryInput'),categories=$('#noteEntryCategories'),categoryInputs=$$('input[name="defineCategory"]',categories);
  noteEntryState={stageKey,lane,point};input.value='';$('#noteEntryCount').textContent='0 / 240';$('#submitNoteEntry').disabled=true;
  const copy={
    Research:['新增观察','先写下你看到的事实或反馈','例如：导师建议我们缩小研究范围'],
    Define:['定义阶段',lane?`添加到「${defineLaneLabels[lane]}」`:'先选择分类，再补充证据','输入后内容会直接进入分类框内'],
    Ideate:['构思阶段','先写下点子，再生成卡片','描述一个完整点子，不会先生成空白标签'],
    Develop:['开发阶段','记录一条测试反馈','写下观察到的行为、问题或改进方向'],
    Review:['回顾阶段','补充一条团队反思','写下学习、风险或下一步']
  }[stageKey]||['新增内容','先写下内容','输入完成后再添加'];
  $('#noteEntryKicker').textContent=copy[0];$('#noteEntryTitle').textContent=copy[1];input.placeholder=copy[2];
  categories.classList.toggle('hidden',stageKey!=='Define');categoryInputs.forEach(radio=>radio.checked=radio.value===lane);
  dialog.showModal();setTimeout(()=>input.focus(),40);
}
function closeNoteEntry(){const dialog=$('#noteEntryDialog');if(dialog.open)dialog.close()}
function addStructuredEntry(stageKey,lane,text){
  const item={id:`s${Date.now()}-${Math.random().toString(36).slice(2,6)}`,text,author:memberName(),createdAt:Date.now()};
  if(stageKey==='Define')structuredStageItems.Define[lane].push(item);else structuredStageItems.Ideate.push(item);
  persistStructuredItems();renderStageExperience(projectStages[projectStageIndex]);scheduleRoomSync();
}
function submitNoteEntry(){
  const text=$('#noteEntryInput').value.trim();if(!text)return;
  const {stageKey,point}=noteEntryState;let lane=noteEntryState.lane;
  if(stageKey==='Define'){
    lane=lane||$('input[name="defineCategory"]:checked')?.value;
    if(!lane){notify('请先选择一个分类');return}
    addStructuredEntry('Define',lane,text);logActivity('Evidence added',`内容已加入${defineLaneLabels[lane]}`);notify(`已添加到「${defineLaneLabels[lane]}」`);
  }else if(stageKey==='Ideate'){
    addStructuredEntry('Ideate',null,text);logActivity('Idea added','输入完成后创建了一张点子卡片');notify('新点子已添加');
  }else{
    const x=point?.x??220+(idSeed%5)*190,y=point?.y??980+(idSeed%3)*150,note=createObject('sticky',x,y,{color:['yellow','green','blue','coral'][idSeed%4],text,focus:false});
    note.querySelector('footer span').textContent=`${memberName()} · 刚刚`;renderMobileNotes();scheduleRoomSync();notify('内容已添加到团队画布');
  }
  closeNoteEntry();
}
$('#noteEntryInput').addEventListener('input',e=>{$('#noteEntryCount').textContent=`${e.target.value.length} / 240`;$('#submitNoteEntry').disabled=!e.target.value.trim()});
$('#noteEntryForm').addEventListener('submit',e=>{e.preventDefault();submitNoteEntry()});
$('#closeNoteEntry').onclick=$('#cancelNoteEntry').onclick=closeNoteEntry;
$('#noteEntryDialog').addEventListener('click',e=>{if(e.target===$('#noteEntryDialog'))closeNoteEntry()});
function bindStageSceneActions(){
  $$('[data-define-add]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();openNoteEntry({stageKey:'Define',lane:btn.dataset.defineAdd})});
  $$('[data-stage-action]').forEach(btn=>btn.onclick=e=>{
    e.stopPropagation();
    const action=btn.dataset.stageAction;
    if(action==='robot'){
      const robot=$('.route-robot'),mobileRobot=$('#mobileRouteMap b');
      robot?.classList.remove('route-running');mobileRobot?.classList.remove('route-running');
      requestAnimationFrame(()=>{robot?.classList.add('route-running');mobileRobot?.classList.add('route-running')});
      btn.textContent='正在预览 A-B-C-D';
      $('#mobileRobotStatus').textContent='路径预览中';
      setTimeout(()=>{robot?.classList.remove('route-running');mobileRobot?.classList.remove('route-running');btn.textContent='再次预览路径';$('#mobileRobotStatus').textContent='在线，等待主持人确认'},3200);
      logActivity('Robot route preview','预览 A-B-C-D 固定收集路径');
      notify('正在预览固定路径，真实移动仍需要主持人确认');
      return;
    }
    if(action==='confirm'){
      $$('.problem-frame,.mobile-stage-mode.define').forEach(panel=>panel.classList.add('team-confirmed'));
      $$('.problem-frame small').forEach(label=>label.textContent='已由团队确认的问题陈述');
      $$('[data-stage-action="confirm"]').forEach(button=>{button.textContent='团队已确认';button.disabled=true});
      logActivity('Accepted suggestion','团队确认了问题陈述');
      notify('问题陈述已由团队确认');
      return;
    }
    if(action==='add'){
      openNoteEntry({stageKey:'Ideate'});
      return;
    }
    if(action==='discuss'){
      workspace.classList.remove('ai-closed');$('#aiPanel').classList.remove('closed');switchTab('chat');
      addAi('这些分类只是建议。团队想先修改分类名称，还是比较某些点子为什么被放在一起？');
      logActivity('Team discussion','团队开始讨论分类建议');
      return;
    }
    if(action==='apply'){
      $$('.category-preview,.mobile-stage-mode.ideate').forEach(panel=>panel.classList.add('team-confirmed'));
      const badge=$('.category-preview header>span');if(badge)badge.textContent='团队已确认';
      $$('[data-stage-action="apply"]').forEach(button=>{button.textContent='分类已确认';button.disabled=true});
      logActivity('Accepted suggestion','团队确认了构思分类，原始点子保持不变');
      notify('分类已确认，原始点子没有被移动');
      return;
    }
    if(action==='test'){
      openNoteEntry({stageKey:'Develop'});
      return;
    }
    if(action==='review'){
      $$('.outcome-summary,.review-actions,.mobile-stage-mode.review').forEach(panel=>panel.classList.add('team-confirmed'));
      const status=$('.outcome-summary header strong');if(status)status.textContent='团队已确认';
      $$('[data-stage-action="review"]').forEach(button=>{button.textContent='下一步已确认';button.disabled=true});
      $('#mobileRobotStatus').textContent='已准备播报';
      $('#mobileRobotTask').textContent='等待主持人开始播报';
      logActivity('Accepted suggestion','团队确认了下一轮行动与负责人');
      notify('下一步已由团队确认，Pip 可以准备播报');
    }
  });
}
function renderStageExperience(stage){
  const scene=$('#stageScene');scene.className=`stage-scene ${stage.key.toLowerCase()}-scene`;scene.innerHTML=stageSceneTemplates[stage.key]?.()||'';
  if(stage.key==='Define'){
    const evidenceCount=latestHardwareTranscripts.filter(record=>(record.kind||'answer')==='answer'&&record.speaker!=='联动检查').length;
    scene.insertAdjacentHTML('beforeend',`<aside class="research-evidence-link"><span>研究证据库</span><strong>${evidenceCount} 条 ESP32 成员观点</strong><p>原始发言保留在研究阶段；定义阶段只负责分类和形成问题。</p><button type="button" id="viewResearchEvidence">查看研究便签</button></aside>`);
    $('#viewResearchEvidence').onclick=()=>{setProjectStage(0);notify('已返回研究阶段，可查看和框选 ESP32 观点')};
  }
  const researchIds=new Set(['n1','n2','n3','n4','n5','n6','n7','n8','n9','n10','c1']);
  const structuredOnly=stage.key==='Define'||stage.key==='Ideate';
  $$('.object').forEach(el=>{if(el.dataset.id==='heading')return;const objectStage=el.dataset.projectStage||(researchIds.has(el.dataset.id)?'Research':'Research');el.classList.toggle('stage-object-hidden',structuredOnly||objectStage!==stage.key)});
  const aiCopy={
    Research:{question:'团队收集到了哪些不同观察？',title:'从团队选择的证据开始',body:'框选一组研究便签后，Pip 可以总结重复内容和不同视角。'},
    Define:{question:'哪些证据支持这个问题表述？',title:'检查事实与解释是否混在一起',body:'框选相关材料后，Pip 可以指出冲突和信息缺口，但问题表述仍由团队确认。'},
    Ideate:{question:'这些点子可能形成哪些主题？',title:'先由团队选择，再请求分类建议',body:'Pip 只分析被框选的点子，并显示可编辑的分类预览，不移动原始内容。'},
    Develop:{question:'测试反馈说明了什么？',title:'比较原型目标与真实反馈',body:'框选测试记录后，Pip 可以总结有效部分和待验证问题。'},
    Review:{question:'哪些结论已经由团队确认？',title:'区分已确认结论与 AI 建议',body:'Pip 可以生成回顾草稿。只有团队确认的内容才会进入下一步和机器人播报。'}
  }[stage.key];
  $('.understanding-card h3').textContent=aiCopy.question;const understandingValues=$$('.understanding-row strong');if(understandingValues[0])understandingValues[0].textContent=stage.label.replace('阶段','');
  $('.reflection-empty strong').textContent=aiCopy.title;$('.reflection-empty p').textContent=aiCopy.body;
  $('.progress-hero span').textContent=stage.label;$('.progress-hero p').textContent=`本页记忆服务于${stage.goal}，并保持可编辑。`;
  $('.journey-head strong').textContent=stage.label.replace('阶段','');$('.journey-head small').textContent=stage.journey;
  $('#mobileStageWorkspace').innerHTML=mobileStageTemplates[stage.key]?.()||'';
  $('#mobileComposeTitle').textContent=stage.compose;$('#mobileComposeHint').textContent=stage.composeHint;
  $('#mobileRobotStatus').textContent=`在线，${stage.label.replace('阶段','')}`;
  $('#mobileRobotMessage').textContent=stage.robotMessage;$('#mobileRobotPosition').textContent=stage.robotPosition;$('#mobileRobotTask').textContent=stage.robotTask;
  $('#mobileRouteMap').innerHTML='<i>A</i><i>B</i><b>Pip</b><i>C</i><i>D</i>';
  renderStructuredStageItems();renderMobileNotes();bindStageSceneActions();
}
function setProjectStage(index){projectStageIndex=(index+projectStages.length)%projectStages.length;const stage=projectStages[projectStageIndex];clearSelection();$$('.stage').forEach(x=>x.classList.toggle('active',x.dataset.stage===stage.key));$$('.journey-step').forEach(x=>x.classList.toggle('active',x.dataset.journey===stage.key));$$('[data-mobile-stage]').forEach(x=>{const active=x.dataset.mobileStage===stage.key;x.classList.toggle('active',active);if(active)x.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'})});$('#stageGuideNumber').textContent=stage.number.split(' ')[0];$('#stageGuideLabel').textContent=stage.label;$('#stageGuideTitle').textContent=stage.title;$('#stageEntry').textContent=stage.entry;$('#stageGoal').textContent=stage.goal;$('#stageExit').textContent=stage.exit;$('#advanceProjectBtn').textContent=`完成${stage.label.replace('阶段','')}，进入${stage.next}`;$('.canvas-heading span').textContent=`${stage.label} · 团队工作坊`;$('.canvas-heading h1').textContent=stage.canvas;$('.canvas-heading p').textContent=stage.goal;$('#mobileStageHeader').textContent=`${stage.label.replace('阶段','')} · ${sessionModes?.[sessionModeIndex]?.name||'自由记录'}`;$('.mobile-stage-card>span').textContent=`${stage.number} · ${stage.label}`;$('.mobile-stage-card h1').textContent=stage.canvas;$('.mobile-stage-card p').textContent=`当前目标：${stage.goal}`;wrap.dataset.projectStage=stage.key.toLowerCase();renderStageExperience(stage);logActivity('Project stage changed',`项目进入${stage.label}`);notify(`已进入${stage.label}，阶段工作区已更新`)}
function chooseProjectStage(index){$('#stageGuide').classList.add('collapsed');setProjectStage(index);scheduleRoomSync()}
$$('.stage').forEach(s=>s.onclick=()=>chooseProjectStage(projectStages.findIndex(x=>x.key===s.dataset.stage)));
$$('.journey-step').forEach(s=>s.onclick=()=>chooseProjectStage(projectStages.findIndex(x=>x.key===s.dataset.journey)));
$$('[data-mobile-stage]').forEach(s=>s.onclick=()=>chooseProjectStage(projectStages.findIndex(x=>x.key===s.dataset.mobileStage)));
$('#advanceProjectBtn').onclick=()=>chooseProjectStage(projectStageIndex+1);$('#stageGuideToggle').onclick=()=>$('#stageGuide').classList.toggle('collapsed');
$('#shareBtn').onclick=async()=>{try{const response=await fetch('/api/status',{cache:'no-store'}),status=await response.json(),url=new URL(status.share_path||'/',location.origin);url.searchParams.set('room',ROOM_ID);url.searchParams.set('join','1');await navigator.clipboard.writeText(url.href);notify('当前讨论房间的邀请链接已复制')}catch(err){notify('暂时无法复制邀请链接')}};

const sessionModes=[
  {name:'自由记录',step:'记录',hint:'团队正在独立收集观察，AI保持安静'},
  {name:'共同讨论',step:'讨论',hint:'成员正在比较观点与补充证据'},
  {name:'团队投票',step:'投票',hint:'每位成员可以为重要观点投票'},
  {name:'回顾总结',step:'回顾',hint:'查看讨论记录，并由团队确认下一步'}
];
let sessionModeIndex=0;
function setSessionMode(index){sessionModeIndex=(index+sessionModes.length)%sessionModes.length;const mode=sessionModes[sessionModeIndex],stage=projectStages[projectStageIndex];$('#sessionModeLabel').textContent=mode.name;$('#sessionStripTitle').textContent=mode.name;$('#sessionStripHint').textContent=mode.hint;$('#mobileStageHeader').textContent=`${stage.label.replace('阶段','')} · ${mode.name}`;$$('.session-steps button').forEach(btn=>btn.classList.toggle('active',btn.dataset.sessionStep===mode.step));if(mode.step==='投票'){const voteTool=$('[data-tool="vote"]');if(voteTool)setTool(voteTool)}logActivity('Session stage changed',`Team moved to ${mode.name}`);notify(`协作阶段：${mode.name}`)}
$('#sessionModeBtn').onclick=()=>setSessionMode(sessionModeIndex+1);
$$('.session-steps button').forEach((btn,index)=>btn.onclick=()=>setSessionMode(index));
$('#completeSessionBtn').onclick=()=>setSessionMode(sessionModeIndex+1);
$('#facilitatorBtn').onclick=()=>$('#facilitatorTray').classList.toggle('hidden');
$('#closeFacilitator').onclick=()=>$('#facilitatorTray').classList.add('hidden');
$('#viewRepeatedBtn').onclick=()=>{setAiSupportState('waiting');clearSelection();['n2','n5','n6'].forEach(id=>select($(`[data-id="${id}"]`),true));$('#facilitatorTray').classList.add('hidden');notify(localText('已定位相关观察。Pip 仍在等待，不会自动分析','Related observations are located. Pip is still waiting and will not analyse them automatically'))};
$('#promptTeamBtn').onclick=openInterventionPrompt;
$('#dismissSignalBtn').onclick=e=>{e.currentTarget.closest('.signal-card')?.remove();$('#signalCount').textContent='1';notify('本次提示已忽略')};
$('#continueWithoutAi').onclick=()=>interventionStage==='support'?stepBackFromIntervention():stepBackFromIntervention({recovered:true,declined:true});
$('#acceptAiPrompt').onclick=offerMinimalPrompt;
$('#askWhyIntervention').onclick=()=>{$('#interventionMessage').textContent=localText('触发原因：8 分钟没有出现新主题，并且同一讨论方向重复出现。Pip 没有分析未选择的便签，也不会替团队判断结论。','Reason: no new theme appeared for 8 minutes and the same discussion direction repeated. Pip did not analyse unselected notes and will not decide the conclusion for the team.')};
$('#closeIntervention').onclick=()=>interventionStage==='support'?stepBackFromIntervention():stepBackFromIntervention({declined:true});
$$('input[name="nextSupport"]').forEach(input=>input.onchange=()=>$('#customSupportPicker').classList.toggle('hidden',input.value!=='custom'||!input.checked));
$('#closeStageReflection').onclick=$('#cancelStageReflection').onclick=()=>{$('#stageReflectionDialog').close();pendingProjectStageIndex=null};
$('#stageReflectionForm').onsubmit=e=>{
  e.preventDefault();const choice=$('input[name="nextSupport"]:checked')?.value||'keep';
  if(choice==='lower')setSupportMode('request',{announce:true});
  if(choice==='custom')setSupportMode($('#customSupportMode').value,{announce:true});
  if(choice==='keep')setSupportMode(supportMode);
  const nextIndex=pendingProjectStageIndex;$('#stageReflectionDialog').close();pendingProjectStageIndex=null;
  logActivity('Support level confirmed',`Next stage support: ${SUPPORT_MODES[supportMode].en}`);resetInterventionStats();chooseProjectStage(nextIndex);
};
let elapsedSeconds=18*60+42;
setInterval(()=>{elapsedSeconds++;const minutes=String(Math.floor(elapsedSeconds/60)).padStart(2,'0'),seconds=String(elapsedSeconds%60).padStart(2,'0');$('#sessionTimer').textContent=`${minutes}:${seconds}`},1000);

let tourIndex=0;
function renderTour(){const slides=$$('.tour-slide'),dots=$$('.tour-progress i');slides.forEach((slide,index)=>slide.classList.toggle('active',index===tourIndex));dots.forEach((dot,index)=>dot.classList.toggle('active',index<=tourIndex));$('#tourBack').disabled=tourIndex===0;$('#tourStep').textContent=`${tourIndex+1} / ${slides.length}`;$('#tourNext').textContent=tourIndex===slides.length-1?'进入工作区':'下一步'}
function closeTour(){localStorage.setItem('colab_tour_seen','1');$('#onboarding').classList.add('hidden')}
function openTour(){tourIndex=0;$('#onboarding').classList.remove('hidden');renderTour()}
const pageParams=new URLSearchParams(location.search);
const savedMemberName=localStorage.getItem('colab_member_name')||'';
$('#joinName').value=savedMemberName;
setTeamSize(teamSize,{persist:false});
setSupportMode(supportMode,{persist:false});
function showWorkspaceEntry(){
  const shouldShowLobby=pageParams.has('join')||!sessionStorage.getItem('colab_joined');
  if(shouldShowLobby){$('#joinLobby').classList.remove('hidden');return}
  if(!localStorage.getItem('colab_tour_seen')||pageParams.has('tour'))openTour();
}
$('#teamSizeDown').onclick=()=>setTeamSize(teamSize-1,{sync:true});
$('#teamSizeUp').onclick=()=>setTeamSize(teamSize+1,{sync:true});
$$('input[name="supportMode"]').forEach(input=>input.onchange=()=>setSupportMode(input.value));
$('#joinName').addEventListener('input',()=>{renderLobbyMembers();$('#joinFormError').classList.add('hidden')});
$('#joinForm').onsubmit=e=>{
  e.preventDefault();
  const name=$('#joinName').value.trim();
  if(!name){$('#joinFormError').classList.remove('hidden');$('#joinName').focus();return}
  localStorage.setItem('colab_member_name',name);
  setSupportMode($('input[name="supportMode"]:checked')?.value||supportMode);
  sessionStorage.setItem('colab_joined','1');
  initRealtimeRoom();
  $('#joinLobby').classList.add('leaving');
  setTimeout(()=>{
    $('#joinLobby').classList.add('hidden');
    $('#joinLobby').classList.remove('leaving');
    notify(`欢迎加入讨论，${name}`);
    openTour();
  },320);
};
showWorkspaceEntry();
loadRoomPreview();
$('#tourNext').onclick=()=>{if(tourIndex>=3)closeTour();else{tourIndex++;renderTour()}};$('#tourBack').onclick=()=>{tourIndex=Math.max(0,tourIndex-1);renderTour()};$('#skipTour').onclick=closeTour;
$('#openTour').onclick=openTour;$('#mobileHelpBtn').onclick=openTour;

$$('.mobile-nav button').forEach(btn=>btn.onclick=()=>{$$('.mobile-nav button').forEach(x=>x.classList.toggle('active',x===btn));$$('.mobile-view').forEach(view=>view.classList.toggle('active',view.dataset.mobileView===btn.dataset.mobileTab))});
$$('.mobile-note footer button').forEach(btn=>btn.onclick=()=>{const current=Number(btn.textContent.replace(/\D/g,''))||0;const voted=btn.classList.toggle('voted');btn.textContent=`${voted?'♥':'♡'} ${voted?current+1:Math.max(0,current-1)}`});
$('#mobileAddNote').onclick=()=>openNoteEntry({stageKey:projectStages[projectStageIndex]?.key||'Research'});
$('#mobileStageInfo').onclick=()=>{const stage=projectStages[projectStageIndex];notify(`${stage.label}：${stage.goal}`)};$('#mobileRobotRequest').onclick=()=>{const stage=projectStages[projectStageIndex];notify(`${stage.robotTask}。移动仍需要主持人确认`)};
window.addEventListener('keydown',e=>{const meta=e.metaKey||e.ctrlKey,typing=e.target.closest?.('[contenteditable],textarea,input');if(meta&&(e.key.toLowerCase()==='z'||e.code==='KeyZ')){if(typing&&document.activeElement===typing)return;e.preventDefault();e.shiftKey?redo():undo();return}if(typing)return;if(e.code==='Space'){spaceDown=true;e.preventDefault();wrap.classList.add('space-pan');return}if(e.key==='Escape'){if(boxState){boxState=null;$('#selectionBox').style.display='none';$('#aiSelectionBadge').classList.add('hidden')}else clearSelection();notify('Selection cancelled');return}if(meta&&e.key.toLowerCase()==='c'){clipboard=[...selected].map(id=>$(`[data-id="${id}"]`)?.outerHTML).filter(Boolean);notify(`${clipboard.length} item${clipboard.length===1?'':'s'} copied`);return}if(meta&&e.key.toLowerCase()==='v'){if(!clipboard.length)return;e.preventDefault();saveHistory();clearSelection();clipboard.forEach(html=>{const holder=document.createElement('div');holder.innerHTML=html;const el=holder.firstElementChild;el.dataset.id=`o${idSeed++}`;el.style.left=`${(parseFloat(el.style.left)||0)+36}px`;el.style.top=`${(parseFloat(el.style.top)||0)+36}px`;canvas.append(el);bindObject(el);select(el,true)});logActivity('Notes created',`${clipboard.length} copied objects pasted`);notify('Pasted');return}if((e.key==='Delete'||e.key==='Backspace')&&selected.size)deleteSelected();if(meta&&e.key.toLowerCase()==='d'&&selected.size){e.preventDefault();$('#duplicateBtn').click()}},{capture:true});window.addEventListener('keyup',e=>{if(e.code==='Space'){spaceDown=false;wrap.classList.remove('space-pan')}});
wrap.addEventListener('scroll',()=>{if(selected.size)updateSelectionBar()},{passive:true});
window.addEventListener('resize',()=>{if(selected.size)updateSelectionBar()});
transform();renderConnections();updateHistoryButtons();renderActivity();setProjectStage(projectStageIndex);initLanguage();logActivity('Page opened','Research demo page ready');loadRecordings().then(records=>records.sort((a,b)=>a.id-b.id).forEach(renderVoiceNote)).catch(()=>{});initAccessGate();if(sessionStorage.getItem('colab_joined'))initRealtimeRoom();
