/**
 * The English catalogue, and the shape every other language must match.
 *
 * `Dictionary` is derived from this object rather than written out separately, so
 * a translation that drops or renames a key fails to compile instead of rendering
 * a hole at runtime. Strings that need a value carry a `{placeholder}`, which
 * `format` substitutes — the placeholder survives translation because word order
 * differs between languages.
 */
export const en = {
  common: {
    close: 'Close',
    continue: 'Continue',
    working: 'Working…',
    language: 'Language',
  },

  auth: {
    tagline: 'Ontology workspace',
    signInHeading: 'Kojiki',
    signUpHeading: 'Register an agent',
    signUpTagline: 'The Orientation Protocol runs next',
    nameLabel: 'Name',
    namePlaceholder: 'Your name',
    emailLabel: 'Email',
    emailPlaceholder: 'you@organization.com',
    passwordLabel: 'Password',
    passwordPlaceholder: 'At least 8 characters',
    signInSubmit: 'Sign in',
    signUpSubmit: 'Create account',
    genericError: 'Something went wrong.',
  },

  signOut: {
    label: 'Sign out',
    pending: 'Signing out…',
  },

  orientation: {
    protocol: 'Orientation Protocol',
    progressLabel: 'Orientation progress',
    providersEyebrow: 'Providers',
    providersPrompt: 'Which provider runs the work?',
    providersWhy:
      'Each department head proposes a model per task and you approve it before anything runs, so nothing spends money you did not agree to. Connecting a provider is what makes that choice real — skip it and everything runs on the free tier instead.',
    connectTitle: 'Connect a provider',
    completeSubmit: 'Complete orientation',
    requiredError:
      'This answer is required — the orchestrator cannot work without it.',
    incompleteError:
      'Answer every required question before completing orientation.',
    saveError: 'Could not save orientation',
    // Split around the industry name so the styled span can stay inline while the
    // surrounding sentence is free to reorder itself per language.
    researchingLead: 'Researching ',
    industryFallback: 'your industry',
    researchingTail:
      ' and selecting the specialists your goal needs. This takes a moment.',
    nextEyebrow: 'what happens next',
    nextBody:
      'The orchestrator researches your goal and industry on the live web — market, competition, regulation, risk — then selects which of the canonical specialists your goal actually needs. Only those are instantiated, and every one of them sees the same research.',
  },

  workspace: {
    settings: 'Settings',
    userLabel: 'User',
    industryLabel: 'Industry',
    goalLabel: 'Goal',
    signedInAs: 'Signed in as {name}',
    orientationComplete: 'Orientation complete',
    sidebarEmpty: 'Open a project to load its department agents.',
    noneSelectedTitle: 'No project selected',
    noneSelectedBody:
      'Choose a project from the rail above to load its OKR tree and department agents.',
    noneYetTitle: 'No projects yet',
    noneYetBody:
      'Create a project from the rail above. The orchestrator researches the goal, asks what it needs to know, and chooses the department agents the work requires.',
  },

  projects: {
    label: 'Projects',
    noObjective: 'no objective set',
    newProject: 'New project',
    deleteAria: 'Delete {name}',
  },

  nav: {
    label: 'Workspace',
    home: 'Home',
    okrs: 'OKRs',
    orchestrator: 'Orchestrator',
    departments: 'Departments',
    knowledgeBase: 'Knowledge Base',
    decisions: 'Decisions',
    reports: 'Reports',
  },

  settings: {
    title: 'Settings',
    summary: 'providers · appearance · language · files',
    closeAria: 'Close settings',
    providersTitle: 'Model providers',
    providersDescription:
      'Which provider runs the agents, and what it costs to run them.',
    connectedProviders: 'Connected providers',
    appearanceTitle: 'Appearance',
    appearanceDescription:
      'The accent colour. The only part of the palette you change.',
    languageTitle: 'Language',
    languageDescription:
      'The language the workspace is written in. Agent replies follow it too.',
    filesTitle: 'Files',
    filesDescription:
      'Documents the agents read as context. Anything here informs every agent, not just the one you are messaging.',
    addFile: 'Add a file',
    readingFile: 'Reading…',
    scopedProject: 'scoped to this project',
    scopedAll: 'available to all projects',
    readError: 'Could not read that file',
    uploadedProject: '{name} is now context for this project.',
    uploadedAll: '{name} is now context for all your projects.',
  },

  /** Chrome of the one-question-per-screen surface, shared by both intakes. */
  intake: {
    enterLead: 'Press ',
    enterTail: ' to continue',
    optionalLead: 'Optional — press ',
    optionalTail: ' to continue, or skip',
    back: 'Back',
    skip: 'Skip',
    lastStep: 'Last step',
  },

  /**
   * The Orientation Protocol's questions, keyed by field name.
   *
   * The ontology file stays the source of truth for field names and requiredness;
   * the sentences a reader sees live here so they follow the chosen language.
   */
  orientationScreens: {
    userName: {
      eyebrow: 'Identity',
      prompt: 'What should the agents call you?',
      why: 'Every department agent addresses you by this name and attributes its recommendations to you.',
      label: 'Your name',
      placeholder: 'e.g. Rei',
    },
    goal: {
      eyebrow: 'Goal',
      prompt: 'What are you trying to accomplish?',
      why: 'The orchestrator reads this goal to research the field and to decide which specialists it needs. The roster follows from the goal.',
      label: 'Your goal',
      placeholder:
        'e.g. Double APAC freight revenue by the end of FY27 without adding headcount',
    },
    industry: {
      eyebrow: 'Industry',
      prompt: 'What industry are you in?',
      why: 'The orchestrator researches this industry — market, competitors, regulation — before any sibling answers you.',
      label: 'Industry',
      placeholder: 'e.g. Logistics and freight forwarding',
    },
    jurisdiction: {
      eyebrow: 'Context',
      prompt: 'Where are you regulated?',
      why: 'Legal and finance read this before they advise. A recommendation that is sound in one jurisdiction can be unlawful in another, so naming it stops the agents reasoning from the wrong default.',
      label: 'Jurisdiction',
      placeholder: 'e.g. Japan, expanding into Singapore',
    },
    geography: {
      eyebrow: 'Context',
      prompt: 'Which markets are you in, and which come next?',
      why: 'Growth and marketing scope their plans to the markets you actually serve, and to the one you are entering, rather than proposing a global strategy you cannot staff.',
      label: 'Geography',
      placeholder: 'e.g. JP domestic today, APAC next',
    },
    businessModel: {
      eyebrow: 'Context',
      prompt: 'How does the business make money?',
      why: 'Finance and strategy reason about margin, unit economics and capital from this. An asset-light forwarder and an asset-heavy carrier get very different advice from the same goal.',
      label: 'Business model',
      placeholder: 'e.g. B2B, asset-light forwarding',
    },
  },

  projectIntake: {
    progressLabel: 'New project progress',
    closeSr: 'the new project intake',
    goalEyebrow: 'New project',
    goalPrompt: 'What is this project trying to achieve?',
    goalWhy:
      'The orchestrator reads this goal, researches the field it sits in, and comes back with what it found and the questions worth asking before anything is planned.',
    goalLabel: 'Project goal',
    goalPlaceholder:
      'e.g. Launch a partner channel that adds 40 qualified deals a quarter',
    goalSubmit: 'Ask the orchestrator',
    goalTooShort: 'Describe the goal in a little more detail.',
    goalTooLong: 'That goal is too long. Keep it under 2000 characters.',
    researchingLead: 'Researching the field around ',
    researchingMid: 'this goal',
    researchingTail:
      ' — market, competition, regulation and risk — then deciding which specialists it needs and what to ask you. This takes a moment.',
    researchError: 'The orchestrator could not research this goal',
    briefEyebrowWeb: 'Orchestrator · live research',
    briefEyebrowModel: 'Orchestrator · model reasoning',
    briefPrompt: 'Here is what I found.',
    briefWhy:
      'Read this before answering. Where it is wrong or stale, say so in the questions that follow — the plan is built from both.',
    briefSubmit: 'Answer the questions',
    questionEyebrow: 'Question {current} of {total}',
    answerLabel: 'Your answer',
    questionRequired: 'This answer is required before the plan can be built.',
    nextQuestion: 'Next question',
    buildProject: 'Build the project',
    namingEyebrow: 'Last step',
    namingPrompt: 'What should this project be called?',
    namingWhy:
      'The goal becomes the root of the OKR tree and the specialists below are already chosen. The name is how you will find it in the rail.',
    nameLabel: 'Project name',
    namePlaceholder: 'e.g. Partner channel',
    nameRequired: 'Give the project a name.',
    namingSubmit: 'Create project',
    creatingNote:
      'Creating the project, instantiating its specialists, and decomposing the goal into sub-goals.',
    createError: 'Could not create the project',
    builtEyebrow: 'what gets built',
    builtRoot: 'The goal becomes the root objective of a new OKR tree.',
    builtSpecialistsLead: '{count} specialists are instantiated: ',
    builtSpecialistsTail: '.',
    builtSubGoals:
      'The root is decomposed into sub-goals owned by those specialists, ready to dispatch.',
    briefMarket: 'Market',
    briefCompetition: 'Competition',
    briefRegulation: 'Regulation',
    briefRisks: 'Key risks',
    briefSpecialists: 'Specialists selected',
    briefSources: 'Sources',
    briefModelNote:
      'Live web research was unavailable, so this brief comes from model reasoning rather than current sources. Treat the figures as indicative and correct anything you know to be wrong.',
  },
  research: {
    title: 'Initial research',
    summary: 'What the orchestrator found before this work was decomposed',
    closeAria: 'Close research',
    openButton: 'Research',
    companySection: 'Company orientation',
    companyNote:
      'The wider research captured during orientation. Every agent in every project receives it alongside the project brief.',
    goalLabel: 'Goal researched',
    industryLabel: 'Industry',
    market: 'Market',
    competition: 'Competition',
    regulation: 'Regulation',
    risks: 'Key risks',
    sources: 'Sources',
    answers: 'Your answers',
    roster: 'Why these specialists',
    methodWeb: 'Live web research',
    methodModel: 'Model reasoning',
    modelNote:
      'Live web research was unavailable when this ran, so this brief comes from model reasoning rather than current sources. Treat the figures as indicative.',
    empty:
      'No research is stored for this project yet. It is captured when a project is created through the orchestrator intake.',
    noBrief: 'No findings were recorded.',
  },
  accents: {
    groupLabel: 'Accent colour',
    selectedSuffix: ' — currently selected',
    saveError: 'Could not save that accent',
    footnote:
      'The accent marks decisions, completed work and the primary action. Everything else — structure, hierarchy and text — stays fixed, so the workspace reads the same whichever you choose.',
    names: {
      seal: 'Seal vermilion',
      blue: 'Pacific blue',
      indigo: 'Sumi indigo',
      green: 'Pine green',
      amber: 'Kitsune amber',
      plum: 'Ume plum',
    },
  },
  providerPanel: {
    intro:
      'A connected provider runs each task on the model you approved for it. With nothing connected, everything falls back to the Vercel AI Gateway free tier — no key and no cost, but rate limited, and it cannot guarantee the specific model a task was approved for.',
    defaultBadge: 'default',
    makeDefault: 'Make default',
    disconnect: 'Disconnect',
    lastErrorLead: 'Last call failed: ',
    legendFirst: 'Connect a provider',
    legendAnother: 'Connect another',
    apiKeyLabel: 'API key',
    keyPrefixLead: 'normally starts with ',
    storedNote: 'Stored encrypted, shown only as a mask afterwards.',
    getKeyLink: 'Get a {label} key',
    alreadyConnected:
      '{label} is already connected. Saving replaces the stored key.',
    connectedNotice: '{label} connected as {maskedKey}.',
    disconnectedNotice:
      '{label} disconnected. Tasks fall back to the free tier.',
    connectedTag: 'connected',
    saving: 'Saving…',
    replaceKey: 'Replace key',
    connect: 'Connect',
    saveError: 'Could not save that key',
    defaultError: 'Could not change the default',
    disconnectError: 'Could not disconnect',
    blurbs: {
      openrouter:
        'One key reaches hundreds of models across providers, including a free tier. The cheapest way to experiment.',
      anthropic: 'Direct to Claude. Use this when you already hold Anthropic credits.',
      openai: 'Direct to GPT. Use this when you already hold OpenAI credits.',
    },
  },
}

export type Dictionary = typeof en
