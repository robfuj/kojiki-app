import type { Dictionary } from './en'

/**
 * The Japanese catalogue.
 *
 * Typed against the English shape, so a missing or renamed key is a compile error.
 * Product terms that carry meaning in the ontology — orchestrator, OKR, provider —
 * are transliterated rather than loosely translated, because the same words appear
 * in the agent output and a reader has to be able to match them.
 */
export const ja: Dictionary = {
  common: {
    close: '閉じる',
    continue: '続ける',
    working: '処理中…',
    language: '言語',
  },

  auth: {
    tagline: 'オントロジー・ワークスペース',
    signInHeading: 'Kojiki',
    signUpHeading: 'エージェントを登録',
    signUpTagline: '次にオリエンテーション・プロトコルが実行されます',
    nameLabel: '名前',
    namePlaceholder: 'あなたの名前',
    emailLabel: 'メールアドレス',
    emailPlaceholder: 'you@organization.com',
    passwordLabel: 'パスワード',
    passwordPlaceholder: '8文字以上',
    signInSubmit: 'サインイン',
    signUpSubmit: 'アカウントを作成',
    genericError: '問題が発生しました。',
  },

  signOut: {
    label: 'サインアウト',
    pending: 'サインアウト中…',
  },

  orientation: {
    protocol: 'オリエンテーション・プロトコル',
    progressLabel: 'オリエンテーションの進行状況',
    providersEyebrow: 'プロバイダー',
    providersPrompt: 'どのプロバイダーが作業を実行しますか？',
    providersWhy:
      '各部門長がタスクごとにモデルを提案し、実行前にあなたが承認するため、合意していない費用が発生することはありません。プロバイダーを接続して、この選択を初めて実際のものにできます。スキップした場合は、すべて無料枠で実行されます。',
    connectTitle: 'プロバイダーを接続',
    completeSubmit: 'オリエンテーションを完了',
    requiredError:
      'この回答は必須です。これがないとオーケストレーターは機能しません。',
    incompleteError:
      'オリエンテーションを完了する前に、すべての必須質問に回答してください。',
    saveError: 'オリエンテーションを保存できませんでした',
    // Japanese puts the object first, so the lead is empty and the tail carries
    // the particle that follows the industry name.
    researchingLead: '',
    industryFallback: 'あなたの業界',
    researchingTail:
      ' を調査し、目標に必要なスペシャリストを選定しています。少し時間がかかります。',
    nextEyebrow: '次に起こること',
    nextBody:
      'オーケストレーターは実際のウェブ上であなたの目標と業界（市場・競合・規制・リスク）を調査し、その目標に本当に必要な正典スペシャリストだけを選定します。それだけがインスタンス化され、すべてが同じ調査結果を共有します。',
  },

  workspace: {
    settings: '設定',
    userLabel: 'ユーザー',
    industryLabel: '業界',
    goalLabel: '目標',
    signedInAs: '{name} としてサインイン中',
    orientationComplete: 'オリエンテーション完了',
    sidebarEmpty: 'プロジェクトを開くと、部門エージェントが読み込まれます。',
    noneSelectedTitle: 'プロジェクトが選択されていません',
    noneSelectedBody:
      '上のレールからプロジェクトを選ぶと、OKRツリーと部門エージェントが読み込まれます。',
    noneYetTitle: 'まだプロジェクトがありません',
    noneYetBody:
      '上のレールからプロジェクトを作成してください。オーケストレーターが目標を調査し、必要なことを質問し、その作業に必要な部門エージェントを選びます。',
  },

  projects: {
    label: 'プロジェクト',
    noObjective: '目標未設定',
    newProject: '新規プロジェクト',
    deleteAria: '{name} を削除',
  },

  settings: {
    title: '設定',
    summary: 'プロバイダー · 外観 · 言語 · ファイル',
    closeAria: '設定を閉じる',
    providersTitle: 'モデルプロバイダー',
    providersDescription:
      'どのプロバイダーがエージェントを実行し、実行にいくらかかるか。',
    connectedProviders: '接続済みプロバイダー',
    appearanceTitle: '外観',
    appearanceDescription:
      'アクセントカラー。パレットの中であなたが変更できる唯一の部分です。',
    languageTitle: '言語',
    languageDescription:
      'ワークスペースの表示言語。エージェントの返信もこれに従います。',
    filesTitle: 'ファイル',
    filesDescription:
      'エージェントがコンテキストとして読むドキュメント。ここにあるものは、メッセージを送っているエージェントだけでなく、すべてのエージェントに反映されます。',
    addFile: 'ファイルを追加',
    readingFile: '読み込み中…',
    scopedProject: 'このプロジェクトに限定',
    scopedAll: 'すべてのプロジェクトで利用可能',
    readError: 'そのファイルを読み込めませんでした',
    uploadedProject: '{name} はこのプロジェクトのコンテキストになりました。',
    uploadedAll: '{name} はすべてのプロジェクトのコンテキストになりました。',
  },

  intake: {
    enterLead: '',
    enterTail: ' で続行するには Enter キーを押してください',
    optionalLead: '省略可 — ',
    optionalTail: ' で続行、またはスキップ',
    back: '戻る',
    skip: 'スキップ',
    lastStep: '最終ステップ',
  },

  orientationScreens: {
    userName: {
      eyebrow: 'アイデンティティ',
      prompt: 'エージェントはあなたを何と呼べばよいですか？',
      why: 'すべての部門エージェントがこの名前であなたに呼びかけ、提案をあなたに帰属させます。',
      label: 'あなたの名前',
      placeholder: '例：玲',
    },
    goal: {
      eyebrow: '目標',
      prompt: '何を達成しようとしていますか？',
      why: 'オーケストレーターはこの目標を読んで領域を調査し、必要なスペシャリストを決めます。ロスターは目標から導かれます。',
      label: 'あなたの目標',
      placeholder: '例：人員を増やさずにFY27末までにAPAC貨物収益を2倍にする',
    },
    industry: {
      eyebrow: '業界',
      prompt: 'どの業界にいますか？',
      why: 'オーケストレーターは、いずれかのエージェントが回答する前に、この業界の市場・競合・規制を調査します。',
      label: '業界',
      placeholder: '例：物流・フォワーディング',
    },
    jurisdiction: {
      eyebrow: 'コンテキスト',
      prompt: 'どの管轄区域の規制を受けますか？',
      why: '法務と財務は助言の前にこれを読みます。ある管轄で妥当な提案が別の管轄では違法になり得るため、明示することでエージェントが誤った前提で推論するのを防ぎます。',
      label: '管轄区域',
      placeholder: '例：日本。シンガポールへ展開中',
    },
    geography: {
      eyebrow: 'コンテキスト',
      prompt: '現在どの市場にいて、次にどこへ進みますか？',
      why: '成長とマーケティングは、実際に対応している市場と参入しようとしている市場に計画を限定し、人員を確保できない全球戦略を提案しません。',
      label: '地理',
      placeholder: '例：現在は日本国内、次にAPAC',
    },
    businessModel: {
      eyebrow: 'コンテキスト',
      prompt: '事業はどのように収益を上げますか？',
      why: '財務と戦略は、ここからマージン・ユニットエコノミクス・資本を推論します。アセットライトなフォワーダーとアセットヘビーなキャリアでは、同じ目標でもまったく異なる助言になります。',
      label: 'ビジネスモデル',
      placeholder: '例：B2B、アセットライト型フォワーディング',
    },
  },

  projectIntake: {
    progressLabel: '新規プロジェクトの進行状況',
    closeSr: '新規プロジェクトの入力',
    goalEyebrow: '新規プロジェクト',
    goalPrompt: 'このプロジェクトは何を達成しようとしていますか？',
    goalWhy:
      'オーケストレーターはこの目標を読み、それが置かれた領域を調査し、見つけたことと、計画の前に聞く価値のある質問を持って戻ります。',
    goalLabel: 'プロジェクトの目標',
    goalPlaceholder: '例：四半期ごとに40件の商談を生むパートナーチャネルを立ち上げる',
    goalSubmit: 'オーケストレーターに聞く',
    goalTooShort: '目標をもう少し詳しく説明してください。',
    goalTooLong: '目標が長すぎます。2000文字以内に収めてください。',
    researchingLead: '',
    researchingMid: 'この目標',
    researchingTail:
      ' を取り巻く領域（市場・競合・規制・リスク）を調査し、必要なスペシャリストと質問を決めています。少し時間がかかります。',
    researchError: 'オーケストレーターはこの目標を調査できませんでした',
    briefEyebrowWeb: 'オーケストレーター · ライブ調査',
    briefEyebrowModel: 'オーケストレーター · モデル推論',
    briefPrompt: '調査結果は以下のとおりです。',
    briefWhy:
      '回答する前に読んでください。誤りや古い情報があれば、続く質問で伝えてください。計画はその両方から作られます。',
    briefSubmit: '質問に回答',
    questionEyebrow: '質問 {current} / {total}',
    answerLabel: 'あなたの回答',
    questionRequired: '計画を作る前にこの回答が必要です。',
    nextQuestion: '次の質問',
    buildProject: 'プロジェクトを構築',
    namingEyebrow: '最終ステップ',
    namingPrompt: 'このプロジェクトを何と呼びますか？',
    namingWhy:
      '目標はOKRツリーのルートになり、下のスペシャリストはすでに選ばれています。名前はレールで探す手がかりになります。',
    nameLabel: 'プロジェクト名',
    namePlaceholder: '例：パートナーチャネル',
    nameRequired: 'プロジェクトに名前を付けてください。',
    namingSubmit: 'プロジェクトを作成',
    creatingNote:
      'プロジェクトを作成し、スペシャリストをインスタンス化し、目標をサブ目標に分解しています。',
    createError: 'プロジェクトを作成できませんでした',
    builtEyebrow: '作られるもの',
    builtRoot: '目標は新しいOKRツリーのルート目標になります。',
    builtSpecialistsLead: '{count} 名のスペシャリストがインスタンス化されます：',
    builtSpecialistsTail: '。',
    builtSubGoals:
      'ルートはそれらのスペシャリストが所有するサブ目標に分解され、すぐにディスパッチできます。',
    briefMarket: '市場',
    briefCompetition: '競合',
    briefRegulation: '規制',
    briefRisks: '主要リスク',
    briefSpecialists: '選定されたスペシャリスト',
    briefSources: '出典',
    briefModelNote:
      'ライブウェブ調査が利用できなかったため、このブリーフは現在の情報源ではなくモデル推論に基づいています。数値は目安として扱い、誤りを知っているものは修正してください。',
  },
  accents: {
    groupLabel: 'アクセントカラー',
    selectedSuffix: ' — 現在選択中',
    saveError: 'そのアクセントを保存できませんでした',
    footnote:
      'アクセントは決定、完了した作業、主要なアクションを示します。それ以外——構造、階層、テキスト——は固定なので、どれを選んでもワークスペースの読み方は変わりません。',
    names: {
      seal: '朱',
      blue: '藍',
      indigo: '墨',
      green: '松',
      amber: '狐',
      plum: '梅',
    },
  },
  providerPanel: {
    intro:
      'プロバイダーを接続すると、各タスクは承認したモデルで実行されます。何も接続していない場合、すべてVercel AI Gatewayの無料枠にフォールバックします。キーも費用も不要ですが、レート制限があり、タスクごとに承認した特定のモデルは保証されません。',
    defaultBadge: '既定',
    makeDefault: '既定にする',
    disconnect: '切断',
    lastErrorLead: '前回の呼び出しが失敗しました: ',
    legendFirst: 'プロバイダーを接続',
    legendAnother: '別のプロバイダーを接続',
    apiKeyLabel: 'APIキー',
    keyPrefixLead: '通常はこれで始まります: ',
    storedNote: '暗号化して保存され、以降はマスク表示のみになります。',
    getKeyLink: '{label}のキーを取得',
    alreadyConnected:
      '{label}は接続済みです。保存すると保存中のキーが置き換わります。',
    connectedNotice: '{label}を{maskedKey}として接続しました。',
    disconnectedNotice:
      '{label}を切断しました。タスクは無料枠にフォールバックします。',
    connectedTag: '接続済み',
    saving: '保存中…',
    replaceKey: 'キーを置き換え',
    connect: '接続',
    saveError: 'そのキーを保存できませんでした',
    defaultError: '既定を変更できませんでした',
    disconnectError: '切断できませんでした',
    blurbs: {
      openrouter:
        '1つのキーで複数プロバイダーの数百のモデルに到達でき、無料枠も含まれます。試すのに最も安価な方法です。',
      anthropic:
        'Claudeへ直接接続。Anthropicのクレジットを既に持っている場合に使用します。',
      openai:
        'GPTへ直接接続。OpenAIのクレジットを既に持っている場合に使用します。',
    },
  },
}
