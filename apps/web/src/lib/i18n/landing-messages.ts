import type { Lang } from "./shared";

const pt = {
  metaTitle: "SeekerAi — Encontre clientes. Crie sites. Apresente seu valor.",
  metaDescription: "Do lead à proposta: encontre negócios, crie sites com IA, gere abordagens personalizadas e conte com um copiloto para conduzir a venda.",
  heroKicker: "PROSPECÇÃO + CRIAÇÃO + VENDAS",
  heroTitle: "Não chegue só com uma proposta.",
  heroAccent: "Chegue com o site pronto.",
  heroDescription: "Encontre o negócio certo, crie uma prévia de site com IA e apresente com uma mensagem feita para aquele cliente. Tudo no mesmo fluxo.",
  primaryCta: "Criar minha primeira oportunidade",
  previewCta: "Ver como funciona",
  heroNote: "Você revisa, personaliza e decide quando enviar.",
  exampleLabel: "Exemplo ilustrativo",
  siteReady: "Prévia de site criada",
  linkReady: "Um link para apresentar sua ideia",
  personalized: "Abordagem com contexto",
  navSites: "Sites com IA",
  navMessages: "Abordagens",
  flow: {
    kicker: "MENOS FERRAMENTAS ABERTAS. MAIS AÇÃO.",
    title: "Uma oportunidade. Quatro passos para ir além.",
    description: "Da descoberta à conversa: veja como as peças se conectam. Selecione uma etapa.",
    steps: [
      { title: "Encontre", body: "Busque negócios pelo nicho e pela região. Analise a presença digital e escolha onde seu serviço pode fazer diferença.", detail: "Um lead com contexto, não só um telefone." },
      { title: "Crie", body: "Gere a primeira versão do site com IA usando o contexto do estabelecimento. Revise o conteúdo e ajuste o visual no editor.", detail: "Uma ideia que o cliente consegue enxergar." },
      { title: "Apresente", body: "Gere uma abordagem personalizada com o link da prévia. Adapte ao seu jeito e abra a conversa no canal adequado.", detail: "Mostre valor antes de discutir o preço." },
      { title: "Negocie", body: "Use o copiloto por texto para pensar em respostas, lidar com objeções e definir o próximo passo. Acompanhe tudo no seu CRM.", detail: "Você conduz a venda. A IA ajuda a preparar." },
    ],
  },
  sites: {
    kicker: "DO “EU FAÇO SITES” AO “FIZ ESTA IDEIA PARA VOCÊ”",
    title: "Cada negócio merece uma apresentação própria.",
    description: "Uma barbearia não vende como uma clínica. Explore composições ilustrativas por nicho: a proposta, os serviços e o convite para agir mudam junto.",
    select: "Escolha um nicho", features: "O que valorizar neste site", note: "Composições ilustrativas. A IA cria a versão do seu lead; conteúdo e tempo de geração variam por projeto.",
    niches: [
      { name: "Barbearias", brand: "HORIZONTE", headline: "Seu estilo.\nSeu momento.", tagline: "Cuidado nos detalhes, do primeiro atendimento ao último acabamento.", cta: "Conheça os serviços", features: ["Serviços em destaque", "Identidade marcante", "Contato fácil"], message: "Olá! Vi a presença da Horizonte e preparei uma ideia de site para apresentar os cortes e facilitar o contato de quem quer agendar. Posso te mostrar a prévia?" },
      { name: "Clínicas", brand: "ESSENZA", headline: "Cuidado que\ncomeça na confiança.", tagline: "Uma experiência acolhedora para cada etapa do seu cuidado.", cta: "Conheça a clínica", features: ["Equipe e especialidades", "Apresentação acolhedora", "Contato organizado"], message: "Olá! Preparei uma proposta visual para a Essenza reunir especialidades, equipe e informações de contato em um só lugar. Posso enviar uma prévia para vocês avaliarem?" },
      { name: "Restaurantes", brand: "CASA OLIVA", headline: "À mesa,\nboas histórias.", tagline: "Ingredientes de verdade. Um lugar para ficar mais um pouco.", cta: "Explore o cardápio", features: ["Cardápio em evidência", "Fotos que valorizam", "Localização e horários"], message: "Olá! Montei uma ideia de site para a Casa Oliva destacar o cardápio e ajudar os clientes a encontrar os horários e a localização. Posso compartilhar a prévia?" },
    ],
  },
  outreach: {
    kicker: "UMA MENSAGEM QUE TEM MOTIVO PARA EXISTIR",
    title: "Não venda uma promessa. Mostre uma possibilidade.",
    description: "O site torna sua proposta concreta. A abordagem conecta essa ideia ao que o negócio precisa — sem parecer uma mensagem enviada para todo mundo.",
    genericLabel: "Sem contexto", generic: "Olá, faço sites. Você tem interesse?",
    personalLabel: "Com contexto e uma ideia para mostrar",
    points: ["Comece por uma observação relevante", "Explique o benefício para aquele negócio", "Convide a pessoa a ver a prévia"],
    note: "Exemplos de texto, não conversas reais. No app, a IA usa o contexto do lead e pode incluir o link do site. Você revisa e envia; não há disparo automático.",
  },
  copilot: {
    kicker: "NÃO PRECISA IMPROVISAR SOZINHO",
    title: "A conversa continuou. Seu copiloto também.",
    description: "Pergunte sobre aquele lead, prepare a próxima mensagem ou peça ajuda com uma objeção. O assistente por texto considera os dados e o contexto enviados na conversa.",
    context: "CONTEXTO DO LEAD", assistant: "Copiloto SeekerAi", choose: "Experimente uma pergunta", note: "Respostas ilustrativas. No app, o copiloto responde com IA ao contexto do lead. Nenhuma ferramenta garante o fechamento.",
    examples: [
      { prompt: "Ele achou caro. O que respondo?", answer: "Antes de baixar o preço, descubra a prioridade. Você pode perguntar: “O que seria mais importante resolver primeiro: apresentar melhor seus serviços ou facilitar o contato? Podemos ajustar o escopo a isso.”" },
      { prompt: "Ele já tem Instagram. E agora?", answer: "Não apresente o site como substituto. Mostre como ele pode organizar serviços, localização e contato em um endereço próprio. Use a prévia para tornar essa diferença visível." },
      { prompt: "Como faço o próximo contato?", answer: "Retome a ideia que vocês discutiram, sem pressionar: “Conseguiu olhar a prévia? Posso ajustar a seção de serviços ao que vocês mais querem destacar.” Respeite a preferência de contato do cliente." },
    ],
  },
  gallery: {
    kicker: "FEITO COM SEEKERAI", title: "Menos imaginação. Mais sites de verdade.",
    description: "Explore uma seleção de sites publicados na plataforma. Role a prévia aqui ou abra o site em outra aba. Cada projeto mantém seu idioma original.",
    open: "Abrir site", preview: "Explorar site", scroll: "Role dentro da prévia para explorar", previous: "Site anterior", next: "Próximo site",
    close: "Fechar prévia", mobile: "Celular", desktop: "Computador", live: "Site publicado", load: "Carregar prévia interativa", original: "Projeto publicado na plataforma",
  },
  video: {
    kicker: "VEJA O FLUXO NA PRÁTICA", title: "Da busca à apresentação, sem pular etapas.",
    description: "Veja a criação do site, a abordagem e o próximo passo da conversa em uma demonstração do produto.",
    play: "Assistir à demonstração", note: "O vídeo só carrega quando você dá play.", error: "Não foi possível reproduzir. Abra o vídeo em uma nova aba.", open: "Abrir vídeo",
  },
  tools: {
    kicker: "NÃO É SÓ UM BUSCADOR", title: "Seu trabalho inteiro ganha companhia.",
    items: [
      ["Sites editáveis", "Crie, revise e personalize a apresentação antes de compartilhar."],
      ["Abordagens e estratégia", "Prepare mensagens, argumentos e próximos passos para cada lead."],
      ["CRM e organização", "Guarde o contexto e acompanhe as oportunidades sem perder o fio da conversa."],
      ["Estúdio criativo", "Explore recursos de criação de imagens e projetos para complementar sua oferta."],
    ],
    note: "Recursos e consumo de créditos variam conforme o plano e a ação escolhida.",
  },
  faqs: [
    ["Preciso saber programar para criar um site?", "Você pode gerar a primeira versão com IA e ajustar conteúdo e aparência no editor visual. Revise informações, imagens, links e serviços antes de apresentar ao cliente."],
    ["Posso enviar o site antes de fechar a venda?", "Sim. A prévia tem um link para apresentar a ideia. No app, confira a validade da demonstração e as condições de publicação e domínio do seu plano."],
    ["As mensagens são enviadas automaticamente?", "Não. A IA ajuda a escrever e pode incluir o link da prévia. Você revisa, adapta e decide quando enviar, respeitando as regras do canal e a preferência do destinatário."],
    ["O SeekerAi garante que vou vender?", "Não. Ele ajuda a encontrar oportunidades, criar uma apresentação e preparar a conversa. O resultado depende da sua oferta, do cliente e de como você conduz a negociação."],
  ],
  closeTitle: "Seu próximo cliente pode",
  closeAccent: "ver a ideia, não só imaginar.",
  closeDescription: "Encontre uma oportunidade. Crie algo para mostrar. Comece uma conversa melhor.",
  searchTitle: "Comece pelo negócio certo.",
  searchDescription: "A busca é o primeiro passo. O que você cria e apresenta depois é o que dá força à sua oferta.",
};

export type LandingMessages = typeof pt;

const en: LandingMessages = {
  metaTitle: "SeekerAi — Find clients. Build websites. Show your value.",
  metaDescription: "From lead to proposal: find businesses, create websites with AI, write tailored outreach and get a copilot to help move the conversation forward.",
  heroKicker: "PROSPECTING + CREATION + SALES", heroTitle: "Don't just bring a proposal.", heroAccent: "Bring a website they can see.",
  heroDescription: "Find the right business, create an AI website preview and introduce it with a message written for that client. One connected workflow.",
  primaryCta: "Create my first opportunity", previewCta: "See how it works", heroNote: "You review, personalize and decide when to send.",
  exampleLabel: "Illustrative example", siteReady: "Website preview created", linkReady: "A link to present your idea", personalized: "Outreach with context",
  navSites: "AI websites", navMessages: "Outreach",
  flow: {
    kicker: "FEWER OPEN TOOLS. MORE PROGRESS.", title: "One opportunity. Four steps to take it further.",
    description: "From discovery to conversation: see how it all connects. Select a step.",
    steps: [
      { title: "Find", body: "Search businesses by niche and location. Look at their digital presence and choose where your service could make a difference.", detail: "A lead with context, not just a phone number." },
      { title: "Create", body: "Generate a first website version with AI using the business context. Review the content and refine the look in the editor.", detail: "An idea the client can actually see." },
      { title: "Present", body: "Generate tailored outreach with the preview link. Make it sound like you and start the conversation in the right channel.", detail: "Show value before discussing price." },
      { title: "Negotiate", body: "Use the text copilot to prepare replies, work through objections and plan the next step. Keep track in your CRM.", detail: "You lead the sale. AI helps you prepare." },
    ],
  },
  sites: {
    kicker: "FROM “I BUILD WEBSITES” TO “I MADE THIS IDEA FOR YOU”", title: "Every business deserves its own presentation.",
    description: "A barbershop doesn't sell like a clinic. Explore illustrative niche layouts: the offer, services and call to action change together.",
    select: "Choose a niche", features: "What to highlight on this website", note: "Illustrative layouts. AI creates your lead's version; content and generation time vary by project.",
    niches: [
      { name: "Barbershops", brand: "HORIZONTE", headline: "Your style.\nYour moment.", tagline: "Care in every detail, from the welcome to the final touch.", cta: "Explore our services", features: ["Featured services", "Distinctive identity", "Easy contact"], message: "Hi! I came across Horizonte and put together a website idea to showcase your cuts and make booking enquiries easier. May I show you the preview?" },
      { name: "Clinics", brand: "ESSENZA", headline: "Care that starts\nwith trust.", tagline: "A welcoming experience at every step of your care.", cta: "Meet the clinic", features: ["Team and specialties", "Welcoming presentation", "Clear contact details"], message: "Hi! I prepared a visual concept for Essenza to bring your specialties, team and contact details together. May I send a preview for you to consider?" },
      { name: "Restaurants", brand: "CASA OLIVA", headline: "Good stories\nstart at the table.", tagline: "Real ingredients. A place to stay a little longer.", cta: "Explore the menu", features: ["Menu in focus", "Compelling photos", "Location and hours"], message: "Hi! I put together a website idea for Casa Oliva to highlight your menu and help customers find opening hours and directions. May I share the preview?" },
    ],
  },
  outreach: {
    kicker: "A MESSAGE WITH A REASON TO EXIST", title: "Don't sell a promise. Show a possibility.",
    description: "A website makes your proposal tangible. Tailored outreach connects the idea to the business's needs, without sounding like a message sent to everyone.",
    genericLabel: "Without context", generic: "Hi, I build websites. Interested?", personalLabel: "With context and an idea to show",
    points: ["Start with a relevant observation", "Explain the benefit for this business", "Invite them to see the preview"],
    note: "Sample messages, not real conversations. In the app, AI uses lead context and can include the website link. You review and send; there is no automatic messaging.",
  },
  copilot: {
    kicker: "YOU DON'T HAVE TO IMPROVISE ALONE", title: "The conversation continues. So does your copilot.",
    description: "Ask about the lead, prepare your next message or work through an objection. The text assistant considers the data and context supplied in the conversation.",
    context: "LEAD CONTEXT", assistant: "SeekerAi Copilot", choose: "Try a question", note: "Illustrative answers. In the app, the copilot uses AI to respond to lead context. No tool guarantees a sale.",
    examples: [
      { prompt: "They think it's expensive. How do I reply?", answer: "Before lowering the price, find out the priority. Try: “What matters most right now: presenting your services better or making enquiries easier? We can adjust the scope around that.”" },
      { prompt: "They already have Instagram. Now what?", answer: "Don't position the website as a replacement. Show how it can bring services, location and contact details together at their own address. Use the preview to make that difference visible." },
      { prompt: "How should I follow up?", answer: "Return to the idea you discussed, without pressure: “Did you get a chance to look at the preview? I can adjust the services section to what you'd most like to highlight.” Respect the client's contact preferences." },
    ],
  },
  gallery: {
    kicker: "MADE WITH SEEKERAI", title: "Less imagining. More real websites.",
    description: "Explore selected websites published on the platform. Scroll through a preview here or open a new tab. Each project keeps its original language.",
    open: "Open website", preview: "Explore website", scroll: "Scroll inside the preview to explore", previous: "Previous website", next: "Next website",
    close: "Close preview", mobile: "Mobile", desktop: "Desktop", live: "Published website", load: "Load interactive preview", original: "Project published on the platform",
  },
  video: {
    kicker: "SEE THE WORKFLOW IN ACTION", title: "From search to presentation, step by step.",
    description: "Watch website creation, outreach and the next step of the conversation in a product walkthrough.",
    play: "Watch the demo", note: "The video only loads when you press play.", error: "Unable to play. Open the video in a new tab.", open: "Open video",
  },
  tools: {
    kicker: "MORE THAN A LEAD FINDER", title: "Support for your whole workflow.",
    items: [
      ["Editable websites", "Create, review and personalize your presentation before sharing."],
      ["Outreach and strategy", "Prepare messages, talking points and next steps for each lead."],
      ["CRM and organization", "Save context and track opportunities without losing the conversation."],
      ["Creative studio", "Explore image creation and project tools to complement your offer."],
    ], note: "Features and credit usage depend on your plan and the selected action.",
  },
  faqs: [
    ["Do I need to code to build a website?", "You can generate a first version with AI and adjust content and appearance in the visual editor. Review information, images, links and services before presenting it to the client."],
    ["Can I share the website before closing the sale?", "Yes. The preview has a link to present your idea. Check the demo's validity and your plan's publishing and domain conditions in the app."],
    ["Are messages sent automatically?", "No. AI helps you write and can include the preview link. You review, adapt and decide when to send, respecting channel rules and the recipient's preferences."],
    ["Does SeekerAi guarantee sales?", "No. It helps you find opportunities, create a presentation and prepare for the conversation. Results depend on your offer, the client and how you handle the negotiation."],
  ],
  closeTitle: "Your next client can", closeAccent: "see the idea, not just imagine it.",
  closeDescription: "Find an opportunity. Create something to show. Start a better conversation.",
  searchTitle: "Start with the right business.", searchDescription: "Search is the first step. What you create and present next gives your offer its strength.",
};

const es: LandingMessages = {
  metaTitle: "SeekerAi — Encuentra clientes. Crea sitios. Muestra tu valor.",
  metaDescription: "Del lead a la propuesta: encuentra negocios, crea sitios con IA, escribe mensajes personalizados y cuenta con un copiloto para avanzar en la venta.",
  heroKicker: "PROSPECCIÓN + CREACIÓN + VENTAS", heroTitle: "No llegues solo con una propuesta.", heroAccent: "Llega con el sitio listo para mostrar.",
  heroDescription: "Encuentra el negocio adecuado, crea una vista previa con IA y preséntala con un mensaje pensado para ese cliente. Todo en un mismo flujo.",
  primaryCta: "Crear mi primera oportunidad", previewCta: "Ver cómo funciona", heroNote: "Tú revisas, personalizas y decides cuándo enviar.",
  exampleLabel: "Ejemplo ilustrativo", siteReady: "Vista previa creada", linkReady: "Un enlace para presentar tu idea", personalized: "Contacto con contexto",
  navSites: "Sitios con IA", navMessages: "Mensajes",
  flow: {
    kicker: "MENOS HERRAMIENTAS ABIERTAS. MÁS ACCIÓN.", title: "Una oportunidad. Cuatro pasos para ir más allá.",
    description: "Del descubrimiento a la conversación: mira cómo se conecta todo. Selecciona una etapa.",
    steps: [
      { title: "Encuentra", body: "Busca negocios por sector y ubicación. Analiza su presencia digital y elige dónde tu servicio puede marcar la diferencia.", detail: "Un lead con contexto, no solo un teléfono." },
      { title: "Crea", body: "Genera la primera versión del sitio con IA usando el contexto del negocio. Revisa el contenido y ajusta el diseño en el editor.", detail: "Una idea que el cliente puede ver." },
      { title: "Presenta", body: "Genera un mensaje personalizado con el enlace de la vista previa. Adáptalo a tu estilo y abre la conversación en el canal adecuado.", detail: "Muestra valor antes de hablar de precio." },
      { title: "Negocia", body: "Usa el copiloto por texto para preparar respuestas, abordar objeciones y definir el siguiente paso. Sigue todo desde tu CRM.", detail: "Tú conduces la venta. La IA ayuda a preparar." },
    ],
  },
  sites: {
    kicker: "DE «HAGO SITIOS» A «PREPARÉ ESTA IDEA PARA TI»", title: "Cada negocio merece su propia presentación.",
    description: "Una barbería no vende como una clínica. Explora diseños ilustrativos por sector: la propuesta, los servicios y la llamada a la acción cambian juntos.",
    select: "Elige un sector", features: "Qué destacar en este sitio", note: "Diseños ilustrativos. La IA crea la versión de tu lead; el contenido y el tiempo de generación varían según el proyecto.",
    niches: [
      { name: "Barberías", brand: "HORIZONTE", headline: "Tu estilo.\nTu momento.", tagline: "Cuidado en cada detalle, desde la bienvenida hasta el acabado.", cta: "Conoce los servicios", features: ["Servicios destacados", "Identidad propia", "Contacto fácil"], message: "¡Hola! Vi la presencia de Horizonte y preparé una idea de sitio para presentar los cortes y facilitar las consultas para reservar. ¿Puedo mostrarte la vista previa?" },
      { name: "Clínicas", brand: "ESSENZA", headline: "Cuidado que empieza\ncon confianza.", tagline: "Una experiencia acogedora en cada etapa de tu atención.", cta: "Conoce la clínica", features: ["Equipo y especialidades", "Presentación acogedora", "Contacto organizado"], message: "¡Hola! Preparé una propuesta visual para Essenza que reúne especialidades, equipo y datos de contacto. ¿Puedo enviar una vista previa para que la valoren?" },
      { name: "Restaurantes", brand: "CASA OLIVA", headline: "En la mesa,\nbuenas historias.", tagline: "Ingredientes de verdad. Un lugar para quedarse un poco más.", cta: "Explora el menú", features: ["Menú protagonista", "Fotos atractivas", "Ubicación y horarios"], message: "¡Hola! Preparé una idea de sitio para Casa Oliva que destaca el menú y ayuda a encontrar horarios y ubicación. ¿Puedo compartir la vista previa?" },
    ],
  },
  outreach: {
    kicker: "UN MENSAJE CON RAZÓN DE SER", title: "No vendas una promesa. Muestra una posibilidad.",
    description: "El sitio hace tangible tu propuesta. El mensaje conecta esa idea con las necesidades del negocio, sin sonar como un envío para todo el mundo.",
    genericLabel: "Sin contexto", generic: "Hola, hago sitios. ¿Te interesa?", personalLabel: "Con contexto y una idea para mostrar",
    points: ["Empieza por una observación relevante", "Explica el beneficio para ese negocio", "Invita a ver la vista previa"],
    note: "Textos de ejemplo, no conversaciones reales. En la app, la IA usa el contexto del lead y puede incluir el enlace. Tú revisas y envías; no hay envíos automáticos.",
  },
  copilot: {
    kicker: "NO TIENES QUE IMPROVISAR A SOLAS", title: "La conversación continúa. Tu copiloto también.",
    description: "Pregunta por ese lead, prepara el siguiente mensaje o pide ayuda con una objeción. El asistente por texto considera los datos y el contexto enviados en la conversación.",
    context: "CONTEXTO DEL LEAD", assistant: "Copiloto SeekerAi", choose: "Prueba una pregunta", note: "Respuestas ilustrativas. En la app, el copiloto responde con IA al contexto del lead. Ninguna herramienta garantiza la venta.",
    examples: [
      { prompt: "Le parece caro. ¿Qué respondo?", answer: "Antes de bajar el precio, descubre la prioridad: «¿Qué sería más importante ahora: presentar mejor los servicios o facilitar el contacto? Podemos ajustar el alcance a eso»." },
      { prompt: "Ya tiene Instagram. ¿Y ahora?", answer: "No presentes el sitio como un sustituto. Muestra cómo puede reunir servicios, ubicación y contacto en una dirección propia. Usa la vista previa para hacer visible la diferencia." },
      { prompt: "¿Cómo hago el seguimiento?", answer: "Retoma la idea sin presionar: «¿Pudiste ver la vista previa? Puedo ajustar la sección de servicios a lo que más quieran destacar». Respeta las preferencias de contacto del cliente." },
    ],
  },
  gallery: {
    kicker: "HECHO CON SEEKERAI", title: "Menos imaginar. Más sitios reales.",
    description: "Explora sitios seleccionados publicados en la plataforma. Desplázate dentro de la vista previa o abre otra pestaña. Cada proyecto mantiene su idioma original.",
    open: "Abrir sitio", preview: "Explorar sitio", scroll: "Desplázate dentro de la vista previa", previous: "Sitio anterior", next: "Siguiente sitio",
    close: "Cerrar vista previa", mobile: "Móvil", desktop: "Computadora", live: "Sitio publicado", load: "Cargar vista previa interactiva", original: "Proyecto publicado en la plataforma",
  },
  video: {
    kicker: "MIRA EL FLUJO EN ACCIÓN", title: "De la búsqueda a la presentación, paso a paso.",
    description: "Mira cómo se crea el sitio, se prepara el mensaje y se continúa la conversación en una demostración del producto.",
    play: "Ver la demostración", note: "El video solo carga al pulsar reproducir.", error: "No se pudo reproducir. Abre el video en otra pestaña.", open: "Abrir video",
  },
  tools: {
    kicker: "NO ES SOLO UN BUSCADOR", title: "Apoyo para todo tu trabajo.",
    items: [
      ["Sitios editables", "Crea, revisa y personaliza tu presentación antes de compartir."],
      ["Mensajes y estrategia", "Prepara mensajes, argumentos y próximos pasos para cada lead."],
      ["CRM y organización", "Guarda el contexto y sigue las oportunidades sin perder el hilo."],
      ["Estudio creativo", "Explora la creación de imágenes y proyectos para complementar tu oferta."],
    ], note: "Los recursos y el consumo de créditos varían según el plan y la acción elegida.",
  },
  faqs: [
    ["¿Necesito saber programar para crear un sitio?", "Puedes generar la primera versión con IA y ajustar contenido y apariencia en el editor visual. Revisa información, imágenes, enlaces y servicios antes de presentarlo."],
    ["¿Puedo enviar el sitio antes de cerrar la venta?", "Sí. La vista previa tiene un enlace para presentar la idea. Consulta su validez y las condiciones de publicación y dominio de tu plan en la app."],
    ["¿Los mensajes se envían automáticamente?", "No. La IA ayuda a escribir y puede incluir el enlace. Tú revisas, adaptas y decides cuándo enviar, respetando las reglas del canal y las preferencias del destinatario."],
    ["¿SeekerAi garantiza ventas?", "No. Ayuda a encontrar oportunidades, crear una presentación y preparar la conversación. El resultado depende de tu oferta, del cliente y de la negociación."],
  ],
  closeTitle: "Tu próximo cliente puede", closeAccent: "ver la idea, no solo imaginarla.",
  closeDescription: "Encuentra una oportunidad. Crea algo para mostrar. Inicia una conversación mejor.",
  searchTitle: "Empieza por el negocio adecuado.", searchDescription: "La búsqueda es el primer paso. Lo que creas y presentas después da fuerza a tu oferta.",
};

const fr: LandingMessages = {
  metaTitle: "SeekerAi — Trouvez des clients. Créez des sites. Montrez votre valeur.",
  metaDescription: "Du prospect à la proposition : trouvez des entreprises, créez des sites avec l’IA et des messages personnalisés, avec un copilote pour préparer la vente.",
  heroKicker: "PROSPECTION + CRÉATION + VENTE", heroTitle: "Ne venez pas seulement avec une proposition.", heroAccent: "Montrez déjà le site.",
  heroDescription: "Trouvez la bonne entreprise, créez un aperçu de site avec l’IA et présentez-le avec un message adapté à ce client. Un seul parcours.",
  primaryCta: "Créer ma première opportunité", previewCta: "Voir comment ça marche", heroNote: "Vous vérifiez, personnalisez et décidez quand envoyer.",
  exampleLabel: "Exemple illustratif", siteReady: "Aperçu du site créé", linkReady: "Un lien pour présenter votre idée", personalized: "Une approche contextualisée",
  navSites: "Sites avec l’IA", navMessages: "Messages",
  flow: {
    kicker: "MOINS D’OUTILS OUVERTS. PLUS D’ACTION.", title: "Une opportunité. Quatre étapes pour aller plus loin.",
    description: "De la découverte à la conversation : voyez comment tout s’articule. Sélectionnez une étape.",
    steps: [
      { title: "Trouvez", body: "Cherchez des entreprises par secteur et région. Analysez leur présence numérique et choisissez où votre service peut être utile.", detail: "Un prospect avec du contexte, pas seulement un numéro." },
      { title: "Créez", body: "Générez une première version du site avec l’IA à partir du contexte de l’entreprise. Vérifiez le contenu et ajustez le visuel dans l’éditeur.", detail: "Une idée que le client peut voir." },
      { title: "Présentez", body: "Générez un message personnalisé avec le lien de l’aperçu. Adaptez-le à votre style et ouvrez la conversation sur le bon canal.", detail: "Montrez la valeur avant de parler du prix." },
      { title: "Négociez", body: "Utilisez le copilote textuel pour préparer des réponses, traiter les objections et définir la suite. Suivez tout dans votre CRM.", detail: "Vous menez la vente. L’IA vous aide à la préparer." },
    ],
  },
  sites: {
    kicker: "DE « JE FAIS DES SITES » À « J’AI PRÉPARÉ CETTE IDÉE POUR VOUS »", title: "Chaque entreprise mérite sa propre présentation.",
    description: "Un barbier ne vend pas comme une clinique. Explorez des compositions illustratives par secteur : l’offre, les services et l’appel à l’action changent ensemble.",
    select: "Choisissez un secteur", features: "Ce qu’il faut mettre en avant", note: "Compositions illustratives. L’IA crée la version de votre prospect ; le contenu et le temps de génération varient selon le projet.",
    niches: [
      { name: "Barbiers", brand: "HORIZONTE", headline: "Votre style.\nVotre moment.", tagline: "Le soin du détail, de l’accueil à la dernière finition.", cta: "Découvrez les services", features: ["Services en vedette", "Identité affirmée", "Contact facile"], message: "Bonjour ! J’ai découvert Horizonte et préparé une idée de site pour présenter vos coupes et faciliter les demandes de rendez-vous. Puis-je vous montrer l’aperçu ?" },
      { name: "Cliniques", brand: "ESSENZA", headline: "Le soin commence\npar la confiance.", tagline: "Une expérience accueillante à chaque étape de votre parcours.", cta: "Découvrez la clinique", features: ["Équipe et spécialités", "Présentation rassurante", "Contact structuré"], message: "Bonjour ! J’ai préparé une proposition visuelle pour Essenza réunissant spécialités, équipe et coordonnées. Puis-je vous envoyer un aperçu pour avis ?" },
      { name: "Restaurants", brand: "CASA OLIVA", headline: "À table,\nles belles histoires.", tagline: "Des ingrédients authentiques. Un lieu où s’attarder.", cta: "Découvrez la carte", features: ["Carte mise en valeur", "Photos attractives", "Adresse et horaires"], message: "Bonjour ! J’ai imaginé un site pour Casa Oliva qui met la carte en valeur et facilite l’accès aux horaires et à l’adresse. Puis-je partager l’aperçu ?" },
    ],
  },
  outreach: {
    kicker: "UN MESSAGE QUI A UNE RAISON D’ÊTRE", title: "Ne vendez pas une promesse. Montrez une possibilité.",
    description: "Le site rend votre proposition concrète. Le message relie cette idée aux besoins de l’entreprise, sans ressembler à un envoi générique.",
    genericLabel: "Sans contexte", generic: "Bonjour, je fais des sites. Intéressé ?", personalLabel: "Avec du contexte et une idée à montrer",
    points: ["Partez d’une observation pertinente", "Expliquez le bénéfice pour cette entreprise", "Invitez à découvrir l’aperçu"],
    note: "Textes d’exemple, pas de vraies conversations. Dans l’app, l’IA utilise le contexte du prospect et peut inclure le lien du site. Vous vérifiez et envoyez ; aucun envoi automatique.",
  },
  copilot: {
    kicker: "VOUS N’AVEZ PAS À IMPROVISER SEUL", title: "La conversation continue. Votre copilote aussi.",
    description: "Posez une question sur le prospect, préparez un message ou travaillez une objection. L’assistant textuel tient compte des données et du contexte fournis dans la conversation.",
    context: "CONTEXTE DU PROSPECT", assistant: "Copilote SeekerAi", choose: "Essayez une question", note: "Réponses illustratives. Dans l’app, le copilote répond avec l’IA au contexte du prospect. Aucun outil ne garantit une vente.",
    examples: [
      { prompt: "Il trouve cela cher. Que répondre ?", answer: "Avant de baisser le prix, identifiez la priorité : « Qu’est-ce qui compte le plus aujourd’hui : mieux présenter vos services ou faciliter le contact ? Nous pouvons adapter le périmètre. »" },
      { prompt: "Il a déjà Instagram. Et maintenant ?", answer: "Ne présentez pas le site comme un remplacement. Montrez comment il rassemble services, adresse et coordonnées sur un espace propre. Rendez la différence visible avec l’aperçu." },
      { prompt: "Comment faire une relance ?", answer: "Reprenez l’idée sans pression : « Avez-vous pu regarder l’aperçu ? Je peux adapter la section des services à ce que vous souhaitez mettre en avant. » Respectez les préférences de contact du client." },
    ],
  },
  gallery: {
    kicker: "CRÉÉ AVEC SEEKERAI", title: "Moins d’imagination. Plus de vrais sites.",
    description: "Explorez des sites sélectionnés publiés sur la plateforme. Faites défiler l’aperçu ou ouvrez un autre onglet. Chaque projet conserve sa langue d’origine.",
    open: "Ouvrir le site", preview: "Explorer le site", scroll: "Faites défiler l’aperçu pour explorer", previous: "Site précédent", next: "Site suivant",
    close: "Fermer l’aperçu", mobile: "Mobile", desktop: "Ordinateur", live: "Site publié", load: "Charger l’aperçu interactif", original: "Projet publié sur la plateforme",
  },
  video: {
    kicker: "LE PARCOURS EN ACTION", title: "De la recherche à la présentation, étape par étape.",
    description: "Découvrez la création du site, le message d’approche et la suite de la conversation dans une démonstration du produit.",
    play: "Voir la démonstration", note: "La vidéo ne se charge qu’au lancement.", error: "Lecture impossible. Ouvrez la vidéo dans un nouvel onglet.", open: "Ouvrir la vidéo",
  },
  tools: {
    kicker: "BIEN PLUS QU’UN MOTEUR DE RECHERCHE", title: "Un soutien pour tout votre travail.",
    items: [
      ["Sites modifiables", "Créez, vérifiez et personnalisez votre présentation avant de la partager."],
      ["Messages et stratégie", "Préparez les messages, les arguments et les prochaines étapes pour chaque prospect."],
      ["CRM et organisation", "Gardez le contexte et suivez les opportunités sans perdre le fil."],
      ["Studio créatif", "Explorez la création d’images et de projets pour compléter votre offre."],
    ], note: "Les fonctionnalités et les crédits consommés dépendent du forfait et de l’action choisie.",
  },
  faqs: [
    ["Faut-il savoir coder pour créer un site ?", "Vous pouvez générer une première version avec l’IA puis ajuster le contenu et le visuel dans l’éditeur. Vérifiez informations, images, liens et services avant la présentation."],
    ["Puis-je envoyer le site avant de conclure ?", "Oui. L’aperçu dispose d’un lien pour présenter votre idée. Consultez sa validité et les conditions de publication et de domaine de votre forfait dans l’app."],
    ["Les messages sont-ils envoyés automatiquement ?", "Non. L’IA aide à rédiger et peut inclure le lien de l’aperçu. Vous vérifiez, adaptez et choisissez quand envoyer, dans le respect des règles du canal et du destinataire."],
    ["SeekerAi garantit-il des ventes ?", "Non. Il aide à trouver des opportunités, à créer une présentation et à préparer la conversation. Le résultat dépend de votre offre, du client et de votre négociation."],
  ],
  closeTitle: "Votre prochain client peut", closeAccent: "voir l’idée, pas seulement l’imaginer.",
  closeDescription: "Trouvez une opportunité. Créez quelque chose à montrer. Ouvrez une meilleure conversation.",
  searchTitle: "Commencez par la bonne entreprise.", searchDescription: "La recherche est la première étape. Ce que vous créez et présentez ensuite donne de la force à votre offre.",
};

const de: LandingMessages = {
  metaTitle: "SeekerAi — Kunden finden. Websites erstellen. Mehrwert zeigen.",
  metaDescription: "Vom Lead zum Angebot: Unternehmen finden, Websites mit KI erstellen, persönliche Nachrichten verfassen und Verkaufsgespräche mit einem Copiloten vorbereiten.",
  heroKicker: "AKQUISE + KREATION + VERTRIEB", heroTitle: "Komm nicht nur mit einem Angebot.", heroAccent: "Zeig gleich die Website.",
  heroDescription: "Finde das passende Unternehmen, erstelle eine Website-Vorschau mit KI und präsentiere sie mit einer Nachricht für genau diesen Kunden. Ein durchgehender Ablauf.",
  primaryCta: "Meine erste Chance entdecken", previewCta: "So funktioniert es", heroNote: "Du prüfst, passt an und entscheidest, wann du sendest.",
  exampleLabel: "Anschauliches Beispiel", siteReady: "Website-Vorschau erstellt", linkReady: "Ein Link, um deine Idee zu zeigen", personalized: "Ansprache mit Kontext",
  navSites: "KI-Websites", navMessages: "Ansprache",
  flow: {
    kicker: "WENIGER OFFENE TOOLS. MEHR FORTSCHRITT.", title: "Eine Chance. Vier Schritte zum nächsten Level.",
    description: "Von der Suche zum Gespräch: So greifen die Schritte ineinander. Wähle einen Schritt.",
    steps: [
      { title: "Finden", body: "Suche Unternehmen nach Branche und Region. Prüfe ihre digitale Präsenz und entscheide, wo dein Service einen Unterschied machen kann.", detail: "Ein Lead mit Kontext, nicht nur eine Telefonnummer." },
      { title: "Erstellen", body: "Erzeuge mit KI eine erste Website-Version auf Basis des Unternehmenskontexts. Prüfe die Inhalte und passe das Design im Editor an.", detail: "Eine Idee, die der Kunde sehen kann." },
      { title: "Präsentieren", body: "Erstelle eine persönliche Ansprache mit dem Vorschau-Link. Passe den Ton an und beginne das Gespräch im passenden Kanal.", detail: "Mehrwert zeigen, bevor du über Preise sprichst." },
      { title: "Verhandeln", body: "Nutze den Text-Copiloten für Antworten, Einwände und nächste Schritte. Behalte alles in deinem CRM im Blick.", detail: "Du führst den Verkauf. KI hilft bei der Vorbereitung." },
    ],
  },
  sites: {
    kicker: "VON „ICH BAUE WEBSITES“ ZU „DIESE IDEE IST FÜR EUCH“", title: "Jedes Unternehmen verdient seinen eigenen Auftritt.",
    description: "Ein Barbershop verkauft anders als eine Praxis. Entdecke beispielhafte Branchenlayouts: Angebot, Leistungen und Handlungsaufruf passen sich gemeinsam an.",
    select: "Branche wählen", features: "Was diese Website hervorheben sollte", note: "Beispielhafte Layouts. Die KI erstellt die Version für deinen Lead; Inhalt und Erstellungsdauer variieren je nach Projekt.",
    niches: [
      { name: "Barbershops", brand: "HORIZONTE", headline: "Dein Stil.\nDein Moment.", tagline: "Sorgfalt in jedem Detail, vom Empfang bis zum letzten Schliff.", cta: "Leistungen entdecken", features: ["Leistungen im Fokus", "Markanter Auftritt", "Einfacher Kontakt"], message: "Hallo! Ich bin auf Horizonte aufmerksam geworden und habe eine Website-Idee vorbereitet, die eure Haarschnitte zeigt und Terminanfragen erleichtert. Darf ich euch die Vorschau zeigen?" },
      { name: "Praxen", brand: "ESSENZA", headline: "Fürsorge beginnt\nmit Vertrauen.", tagline: "Eine einladende Erfahrung bei jedem Schritt Ihrer Betreuung.", cta: "Praxis kennenlernen", features: ["Team und Fachgebiete", "Vertrauensvoller Auftritt", "Klare Kontaktdaten"], message: "Hallo! Ich habe einen visuellen Vorschlag für Essenza erstellt, der Fachgebiete, Team und Kontakt bündelt. Darf ich Ihnen eine Vorschau zur Ansicht senden?" },
      { name: "Restaurants", brand: "CASA OLIVA", headline: "Gute Geschichten\nbeginnen am Tisch.", tagline: "Echte Zutaten. Ein Ort zum Verweilen.", cta: "Speisekarte entdecken", features: ["Speisekarte im Blick", "Ansprechende Fotos", "Adresse und Öffnungszeiten"], message: "Hallo! Ich habe eine Website-Idee für Casa Oliva entworfen, die die Speisekarte hervorhebt und Öffnungszeiten sowie Anfahrt leicht auffindbar macht. Darf ich die Vorschau teilen?" },
    ],
  },
  outreach: {
    kicker: "EINE NACHRICHT MIT EINEM ECHTEN ANLASS", title: "Verkaufe kein Versprechen. Zeige eine Möglichkeit.",
    description: "Die Website macht deinen Vorschlag greifbar. Die Ansprache verbindet ihn mit dem Bedarf des Unternehmens, statt wie eine Massennachricht zu klingen.",
    genericLabel: "Ohne Kontext", generic: "Hallo, ich baue Websites. Interesse?", personalLabel: "Mit Kontext und einer sichtbaren Idee",
    points: ["Mit einer relevanten Beobachtung beginnen", "Den Nutzen für dieses Unternehmen erklären", "Zum Ansehen der Vorschau einladen"],
    note: "Beispieltexte, keine echten Gespräche. In der App nutzt die KI den Lead-Kontext und kann den Website-Link ergänzen. Du prüfst und sendest; kein automatischer Versand.",
  },
  copilot: {
    kicker: "DU MUSST NICHT ALLEIN IMPROVISIEREN", title: "Das Gespräch geht weiter. Dein Copilot auch.",
    description: "Frage nach diesem Lead, bereite die nächste Nachricht vor oder bearbeite einen Einwand. Der Text-Assistent berücksichtigt die im Gespräch übermittelten Daten und Zusammenhänge.",
    context: "LEAD-KONTEXT", assistant: "SeekerAi Copilot", choose: "Probiere eine Frage aus", note: "Beispielantworten. In der App antwortet der Copilot mit KI auf den Lead-Kontext. Kein Tool garantiert einen Abschluss.",
    examples: [
      { prompt: "Der Preis ist ihm zu hoch. Was antworte ich?", answer: "Finde zuerst die Priorität, statt sofort den Preis zu senken: „Was ist gerade wichtiger: Ihre Leistungen besser zu präsentieren oder Anfragen zu erleichtern? Wir können den Umfang darauf abstimmen.“" },
      { prompt: "Er hat schon Instagram. Und jetzt?", answer: "Präsentiere die Website nicht als Ersatz. Zeige, wie sie Leistungen, Standort und Kontakt an einer eigenen Adresse bündelt. Mach den Unterschied mit der Vorschau sichtbar." },
      { prompt: "Wie fasse ich nach?", answer: "Greife die besprochene Idee ohne Druck auf: „Konnten Sie die Vorschau ansehen? Ich kann den Leistungsbereich an das anpassen, was Sie hervorheben möchten.“ Respektiere die Kontaktwünsche des Kunden." },
    ],
  },
  gallery: {
    kicker: "MIT SEEKERAI ERSTELLT", title: "Weniger vorstellen. Mehr echte Websites.",
    description: "Entdecke ausgewählte, auf der Plattform veröffentlichte Websites. Scrolle in der Vorschau oder öffne einen neuen Tab. Jedes Projekt bleibt in seiner Originalsprache.",
    open: "Website öffnen", preview: "Website erkunden", scroll: "Zum Erkunden in der Vorschau scrollen", previous: "Vorherige Website", next: "Nächste Website",
    close: "Vorschau schließen", mobile: "Mobil", desktop: "Desktop", live: "Veröffentlichte Website", load: "Interaktive Vorschau laden", original: "Auf der Plattform veröffentlichtes Projekt",
  },
  video: {
    kicker: "DER ABLAUF IN DER PRAXIS", title: "Von der Suche zur Präsentation, Schritt für Schritt.",
    description: "Sieh dir Website-Erstellung, Ansprache und den nächsten Gesprächsschritt in einer Produktvorführung an.",
    play: "Demo ansehen", note: "Das Video lädt erst, wenn du auf Abspielen klickst.", error: "Wiedergabe nicht möglich. Öffne das Video in einem neuen Tab.", open: "Video öffnen",
  },
  tools: {
    kicker: "MEHR ALS EINE SUCHMASCHINE", title: "Unterstützung für deinen ganzen Workflow.",
    items: [
      ["Bearbeitbare Websites", "Erstellen, prüfen und anpassen, bevor du deine Präsentation teilst."],
      ["Ansprache und Strategie", "Nachrichten, Argumente und nächste Schritte für jeden Lead vorbereiten."],
      ["CRM und Organisation", "Kontext speichern und Chancen verfolgen, ohne den Gesprächsfaden zu verlieren."],
      ["Kreativstudio", "Bilder und Projekte erstellen, die dein Angebot ergänzen."],
    ], note: "Funktionen und Credit-Verbrauch hängen vom Tarif und der gewählten Aktion ab.",
  },
  faqs: [
    ["Muss ich programmieren können?", "Du kannst eine erste Version mit KI erzeugen und Inhalt sowie Aussehen im visuellen Editor anpassen. Prüfe Informationen, Bilder, Links und Leistungen vor der Präsentation."],
    ["Kann ich die Website vor dem Abschluss senden?", "Ja. Die Vorschau hat einen Link, mit dem du die Idee zeigen kannst. Prüfe in der App ihre Gültigkeit sowie die Veröffentlichungs- und Domainbedingungen deines Tarifs."],
    ["Werden Nachrichten automatisch gesendet?", "Nein. Die KI hilft beim Schreiben und kann den Vorschau-Link ergänzen. Du prüfst, passt an und entscheidest über den Versand unter Beachtung der Kanalregeln und Empfängerwünsche."],
    ["Garantiert SeekerAi Verkäufe?", "Nein. Es hilft, Chancen zu finden, Präsentationen zu erstellen und Gespräche vorzubereiten. Das Ergebnis hängt von deinem Angebot, dem Kunden und deiner Verhandlung ab."],
  ],
  closeTitle: "Dein nächster Kunde kann", closeAccent: "die Idee sehen, statt sie nur zu erahnen.",
  closeDescription: "Finde eine Chance. Erstelle etwas zum Zeigen. Starte ein besseres Gespräch.",
  searchTitle: "Beginne mit dem passenden Unternehmen.", searchDescription: "Die Suche ist der erste Schritt. Was du danach erstellst und zeigst, macht dein Angebot stark.",
};

const it: LandingMessages = {
  metaTitle: "SeekerAi — Trova clienti. Crea siti. Mostra il tuo valore.",
  metaDescription: "Dal lead alla proposta: trova attività, crea siti con l’IA, scrivi messaggi personalizzati e usa un copilota per preparare la vendita.",
  heroKicker: "PROSPEZIONE + CREAZIONE + VENDITE", heroTitle: "Non arrivare solo con una proposta.", heroAccent: "Arriva con un sito da mostrare.",
  heroDescription: "Trova l’attività giusta, crea un’anteprima del sito con l’IA e presentala con un messaggio pensato per quel cliente. Tutto nello stesso flusso.",
  primaryCta: "Creare la mia prima opportunità", previewCta: "Scopri come funziona", heroNote: "Rivedi, personalizzi e decidi tu quando inviare.",
  exampleLabel: "Esempio illustrativo", siteReady: "Anteprima del sito creata", linkReady: "Un link per presentare la tua idea", personalized: "Un approccio con contesto",
  navSites: "Siti con IA", navMessages: "Messaggi",
  flow: {
    kicker: "MENO STRUMENTI APERTI. PIÙ AZIONE.", title: "Un’opportunità. Quattro passi per andare oltre.",
    description: "Dalla scoperta alla conversazione: guarda come si collegano i passaggi. Seleziona una fase.",
    steps: [
      { title: "Trova", body: "Cerca attività per settore e zona. Analizza la presenza digitale e scegli dove il tuo servizio può fare la differenza.", detail: "Un lead con contesto, non solo un numero." },
      { title: "Crea", body: "Genera la prima versione del sito con l’IA usando il contesto dell’attività. Rivedi i contenuti e adatta lo stile nell’editor.", detail: "Un’idea che il cliente può vedere." },
      { title: "Presenta", body: "Genera un messaggio personalizzato con il link dell’anteprima. Adattalo al tuo stile e avvia la conversazione nel canale giusto.", detail: "Mostra il valore prima di parlare del prezzo." },
      { title: "Negozia", body: "Usa il copilota testuale per preparare risposte, affrontare obiezioni e definire il prossimo passo. Segui tutto nel CRM.", detail: "Tu guidi la vendita. L’IA aiuta a prepararla." },
    ],
  },
  sites: {
    kicker: "DA «CREO SITI» A «HO PREPARATO QUESTA IDEA PER TE»", title: "Ogni attività merita una presentazione propria.",
    description: "Un barbiere non vende come una clinica. Esplora composizioni illustrative per settore: proposta, servizi e invito all’azione cambiano insieme.",
    select: "Scegli un settore", features: "Cosa valorizzare in questo sito", note: "Composizioni illustrative. L’IA crea la versione del tuo lead; contenuti e tempi di generazione variano in base al progetto.",
    niches: [
      { name: "Barbieri", brand: "HORIZONTE", headline: "Il tuo stile.\nIl tuo momento.", tagline: "Cura in ogni dettaglio, dall’accoglienza all’ultima rifinitura.", cta: "Scopri i servizi", features: ["Servizi in evidenza", "Identità distintiva", "Contatto semplice"], message: "Ciao! Ho scoperto Horizonte e preparato un’idea di sito per presentare i tagli e facilitare le richieste di appuntamento. Posso mostrarti l’anteprima?" },
      { name: "Cliniche", brand: "ESSENZA", headline: "La cura inizia\ndalla fiducia.", tagline: "Un’esperienza accogliente in ogni fase del tuo percorso.", cta: "Scopri la clinica", features: ["Team e specialità", "Presentazione accogliente", "Contatti organizzati"], message: "Buongiorno! Ho preparato una proposta visiva per Essenza che riunisce specialità, team e contatti. Posso inviare un’anteprima da valutare?" },
      { name: "Ristoranti", brand: "CASA OLIVA", headline: "A tavola,\nbelle storie.", tagline: "Ingredienti veri. Un luogo dove fermarsi un po’ di più.", cta: "Esplora il menù", features: ["Menù protagonista", "Foto invitanti", "Posizione e orari"], message: "Ciao! Ho preparato un’idea di sito per Casa Oliva che valorizza il menù e aiuta a trovare orari e posizione. Posso condividere l’anteprima?" },
    ],
  },
  outreach: {
    kicker: "UN MESSAGGIO CHE HA UN MOTIVO PER ESISTERE", title: "Non vendere una promessa. Mostra una possibilità.",
    description: "Il sito rende concreta la proposta. Il messaggio collega l’idea alle esigenze dell’attività, senza sembrare un testo inviato a tutti.",
    genericLabel: "Senza contesto", generic: "Ciao, creo siti. Ti interessa?", personalLabel: "Con contesto e un’idea da mostrare",
    points: ["Parti da un’osservazione pertinente", "Spiega il vantaggio per quell’attività", "Invita a guardare l’anteprima"],
    note: "Testi di esempio, non conversazioni reali. Nell’app l’IA usa il contesto del lead e può includere il link del sito. Tu rivedi e invii; nessun invio automatico.",
  },
  copilot: {
    kicker: "NON DEVI IMPROVVISARE DA SOLO", title: "La conversazione continua. Anche il tuo copilota.",
    description: "Chiedi informazioni su quel lead, prepara il prossimo messaggio o affronta un’obiezione. L’assistente testuale considera i dati e il contesto forniti nella conversazione.",
    context: "CONTESTO DEL LEAD", assistant: "Copilota SeekerAi", choose: "Prova una domanda", note: "Risposte illustrative. Nell’app il copilota risponde con l’IA al contesto del lead. Nessuno strumento garantisce una vendita.",
    examples: [
      { prompt: "Lo trova caro. Cosa rispondo?", answer: "Prima di abbassare il prezzo, scopri la priorità: «Cosa sarebbe più importante adesso: presentare meglio i servizi o facilitare il contatto? Possiamo adattare il progetto a questo»." },
      { prompt: "Ha già Instagram. E adesso?", answer: "Non presentare il sito come un sostituto. Mostra come riunisce servizi, posizione e contatti in uno spazio proprio. Usa l’anteprima per rendere visibile la differenza." },
      { prompt: "Come ricontatto il cliente?", answer: "Riprendi l’idea senza pressione: «Hai potuto vedere l’anteprima? Posso adattare la sezione servizi a ciò che volete mettere in risalto». Rispetta le preferenze di contatto del cliente." },
    ],
  },
  gallery: {
    kicker: "CREATO CON SEEKERAI", title: "Meno immaginazione. Più siti veri.",
    description: "Esplora siti selezionati pubblicati sulla piattaforma. Scorri nell’anteprima o apri un’altra scheda. Ogni progetto mantiene la lingua originale.",
    open: "Apri sito", preview: "Esplora sito", scroll: "Scorri nell’anteprima per esplorare", previous: "Sito precedente", next: "Sito successivo",
    close: "Chiudi anteprima", mobile: "Cellulare", desktop: "Computer", live: "Sito pubblicato", load: "Carica anteprima interattiva", original: "Progetto pubblicato sulla piattaforma",
  },
  video: {
    kicker: "IL FLUSSO IN PRATICA", title: "Dalla ricerca alla presentazione, passo dopo passo.",
    description: "Guarda la creazione del sito, il messaggio e il passo successivo della conversazione in una dimostrazione del prodotto.",
    play: "Guarda la dimostrazione", note: "Il video si carica solo quando premi play.", error: "Riproduzione non riuscita. Apri il video in un’altra scheda.", open: "Apri video",
  },
  tools: {
    kicker: "NON È SOLO UN MOTORE DI RICERCA", title: "Un supporto per tutto il tuo lavoro.",
    items: [
      ["Siti modificabili", "Crea, rivedi e personalizza la presentazione prima di condividerla."],
      ["Messaggi e strategia", "Prepara messaggi, argomenti e prossimi passi per ogni lead."],
      ["CRM e organizzazione", "Conserva il contesto e segui le opportunità senza perdere il filo."],
      ["Studio creativo", "Esplora la creazione di immagini e progetti per completare la tua offerta."],
    ], note: "Funzionalità e consumo di crediti variano in base al piano e all’azione scelta.",
  },
  faqs: [
    ["Devo saper programmare per creare un sito?", "Puoi generare una prima versione con l’IA e modificare contenuti e aspetto nell’editor visuale. Controlla informazioni, immagini, link e servizi prima di presentarlo."],
    ["Posso inviare il sito prima di chiudere la vendita?", "Sì. L’anteprima ha un link per presentare l’idea. Nell’app verifica la validità e le condizioni di pubblicazione e dominio del tuo piano."],
    ["I messaggi vengono inviati automaticamente?", "No. L’IA aiuta a scrivere e può includere il link dell’anteprima. Tu rivedi, adatti e decidi quando inviare, rispettando le regole del canale e le preferenze del destinatario."],
    ["SeekerAi garantisce vendite?", "No. Aiuta a trovare opportunità, creare una presentazione e preparare la conversazione. Il risultato dipende dall’offerta, dal cliente e dalla negoziazione."],
  ],
  closeTitle: "Il tuo prossimo cliente può", closeAccent: "vedere l’idea, non solo immaginarla.",
  closeDescription: "Trova un’opportunità. Crea qualcosa da mostrare. Inizia una conversazione migliore.",
  searchTitle: "Inizia dall’attività giusta.", searchDescription: "La ricerca è il primo passo. Quello che crei e presenti dopo dà forza alla tua offerta.",
};

const messages: Record<Lang, LandingMessages> = { pt, en, es, fr, de, it };
export const getLandingMessages = (lang: Lang): LandingMessages => messages[lang];
