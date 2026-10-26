// Strings fixas dos templates de site — config.lang ("pt"|"en"|"es") vem do
// país do lead na geração. Idiomas sem dict caem no inglês (mais neutro que PT).
export interface SiteStrings {
  navPortfolio: string; navDuvidas: string; navContato: string;
  heroTop: string; scrollConhecer: (prep: string) => string;
  reelsEyebrow: string; sobConsulta: string; ofertasEyebrow: string;
  portfolioEyebrow: string; corridorA: string; corridorB: string;
  trabalhosA: string; emDestaque: string; experienciaEyebrow: string;
  pensadoA: string; pensadoB: string; equipeEyebrow: string;
  equipeA: string; equipeB: string; profissional: string;
  reviewsTotal: (t: number, fonte: string) => string;
  reviewsReal: (t: number, fonte: string) => string;
  recadoCliente: string; recadoAlt: string;
  ctaAgendar: string; catFallback: string; ofertas: string;
  prepFallback: string; marqueeFallback: string;
  servicosTitleFb: string; momentoFb: string; ctaEmFb: string;
  serviceNote: string;
  ondeEstamos: string; esperamosA: string; esperamosB: string;
  endereco: string; horarios: string; contato: string;
  abrirMaps: string; chamarWa: string; ligar: string; ligarShort: string;
  duvidas: string; faqA: string; faqB: string;
  footerA: string; feitoCom: string; por: string;
  voltarTopo: string; fechar: string; anterior: string; proxima: string; arraste: string;
  waFloatMsg: (nome: string) => string;
  waServicoMsg: (prep: string, nome: string) => string;
  dealAproveitar: string; dealQuero: string;
  agendamento: string; reserveA: string; reserveB: string;
  stepServico: string; stepProf: string; stepData: string; stepHora: string;
  stepConfirma: string; semPref: string; primeiraDisp: string;
  sumServico: string; sumProf: string; sumData: string; sumHora: string;
  sumNome: string; sumTel: string;
  seuNome: string; nomePh: string; seuWhats: string; telPh: string;
  voltar: string; continuar: string; enviarWhats: string; bookMsg: string;
  errNome: string; errServico: string; errProf: string; errData: string; errHora: string;
  semHorarios: string; visitEyebrow: string; visitTitle: (noLugar: string) => string;
  tracaRota: string; comoChegar: string;
  waBookHello: (nome: string) => string;
  dows: string[];
  /* barbershop */
  navHistoria: string; navGaleria: string; navServicos: string;
  ctaAgendarHorario: string; cidadeFb: string; heroDesc: string;
  scrollHistoria: string; equipeCap: string; equipeAlt: (n: string) => string;
  heroAlt: string; marqueeBarber: string; nossaHistoria: string;
  deOndeViemos: string; corridorBarberEyebrow: string;
  corridorBarberA: string; corridorBarberB: string;
  galeriaEyebrow: string; porDentroA: string; fotoCap: (i: number) => string;
  servicosEyebrow: string; oQueFazemosA: string; deMelhorB: string;
  valorBalcao: string; cadaDetalheA: string; contaB: string;
  passaAquiA: string; footerBarberA: string; footerBarberB: string;
  agendarAgora: string; direitos: string; waBarberFloat: (n: string) => string;
  reserveBarberA: string; reserveBarberB: string; stepProfBarber: string;
  primeiroDisp: string; barbeiro: string;
  /* gate de site pausado (página pública) */
  gateTitle: string; gateA: string; gateB: string; gateCta: string;
}

const PT: SiteStrings = {
  navPortfolio: "Portfólio", navDuvidas: "Dúvidas", navContato: "Contato",
  heroTop: "Um lugar para você", scrollConhecer: (p) => `Role para conhecer ${p}`,
  reelsEyebrow: "Nos reels", sobConsulta: "Sob consulta", ofertasEyebrow: "Só aqui",
  portfolioEyebrow: "Portfólio", corridorA: "Detalhes que", corridorB: "fazem a diferença",
  trabalhosA: "Trabalhos", emDestaque: "em destaque", experienciaEyebrow: "A experiência",
  pensadoA: "Pensado nos", pensadoB: "detalhes", equipeEyebrow: "Quem cuida de você",
  equipeA: "Nossa", equipeB: "equipe", profissional: "Profissional",
  reviewsTotal: (t, f) => `${t} avaliações no ${f}`,
  reviewsReal: (t, f) => `${t} avaliações reais no ${f}`,
  recadoCliente: "Recado real de cliente · WhatsApp", recadoAlt: "Recado real de cliente",
  ctaAgendar: "Agendar", catFallback: "Serviços", ofertas: "Ofertas",
  prepFallback: "o espaço", marqueeFallback: "Um lugar para você se cuidar",
  servicosTitleFb: "Escolha o seu", momentoFb: "momento", ctaEmFb: "se cuidar",
  serviceNote: "Valores e disponibilidade confirmados no WhatsApp — sem compromisso.",
  ondeEstamos: "Onde estamos", esperamosA: "Te esperamos", esperamosB: "aqui",
  endereco: "Endereço", horarios: "Horários", contato: "Contato",
  abrirMaps: "Abrir no Google Maps", chamarWa: "Chamar no WhatsApp", ligar: "Ligar agora", ligarShort: "Ligar",
  duvidas: "Dúvidas", faqA: "Perguntas", faqB: "frequentes",
  footerA: "Seu momento de", feitoCom: "Feito com", por: "por",
  voltarTopo: "Voltar ao topo", fechar: "Fechar", anterior: "Anterior", proxima: "Próxima", arraste: "← arraste →",
  waFloatMsg: (n) => `Olá! Vim pelo site do ${n} ✨`,
  waServicoMsg: (p, n) => `Olá! Vim pelo site ${p} e quero saber sobre ${n}.`,
  dealAproveitar: "Aproveitar", dealQuero: "Quero essa",
  agendamento: "Agendamento", reserveA: "Reserve seu", reserveB: "momento",
  stepServico: "1. Escolha o serviço", stepProf: "2. Com quem você prefere?", stepData: "Escolha a data",
  stepHora: "Escolha o horário", stepConfirma: "Confirme no WhatsApp",
  semPref: "Sem preferência", primeiraDisp: "Primeira disponível",
  sumServico: "Serviço", sumProf: "Profissional", sumData: "Data", sumHora: "Horário",
  sumNome: "Nome", sumTel: "Telefone",
  seuNome: "Seu nome", nomePh: "Como te chamamos?", seuWhats: "Seu WhatsApp (opcional)", telPh: "(21) 90000-0000",
  voltar: "Voltar", continuar: "Continuar", enviarWhats: "Enviar no WhatsApp",
  bookMsg: "A mensagem é montada com suas escolhas — é só enviar e a gente confirma na hora.",
  errNome: "Informe seu nome pra identificar o agendamento.",
  errServico: "Escolha um serviço pra continuar.",
  errProf: "Escolha um profissional ou 'Sem preferência'.",
  errData: "Escolha uma data.", errHora: "Escolha um horário.",
  semHorarios: "Sem horários livres nesse dia — escolhe outra data.",
  visitEyebrow: "Visite-nos", visitTitle: (p) => `Te esperamos ${p}`,
  tracaRota: "Traçar rota", comoChegar: "Como chegar",
  waBookHello: (n) => `Olá! Quero agendar no ${n} ✨`,
  dows: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  navHistoria: "História", navGaleria: "Galeria", navServicos: "Serviços",
  ctaAgendarHorario: "Agendar horário", cidadeFb: "Barbearia",
  heroDesc: "Escolha seu serviço, seu horário e confirme direto pelo WhatsApp. Sem app, sem cadastro — do jeito que deve ser.",
  scrollHistoria: "Role para conhecer nossa história", equipeCap: "A equipe",
  equipeAlt: (n) => `Equipe da ${n}`, heroAlt: "equipe e ambiente",
  marqueeBarber: "Desde o primeiro corte", nossaHistoria: "Nossa história",
  deOndeViemos: "De onde viemos", corridorBarberEyebrow: "O dia a dia",
  corridorBarberA: "Cada corte conta", corridorBarberB: "uma história",
  galeriaEyebrow: "Galeria", porDentroA: "Por dentro da",
  fotoCap: (i) => `Foto ${i} · ampliar`,
  servicosEyebrow: "Serviços", oQueFazemosA: "O que a gente faz", deMelhorB: "de melhor",
  valorBalcao: "Valor no balcão", cadaDetalheA: "Cada detalhe", contaB: "conta",
  passaAquiA: "Passa", footerBarberA: "Bora renovar", footerBarberB: "o visual?",
  agendarAgora: "Agendar agora", direitos: "Todos os direitos",
  waBarberFloat: (n) => `Olá! Vim pelo site da ${n} 💈`,
  reserveBarberA: "Reserve em", reserveBarberB: "30 segundos",
  stepProfBarber: "2. Escolha o profissional", primeiroDisp: "Primeiro disponível",
  barbeiro: "Barbeiro",
  gateTitle: "Site em pausa",
  gateA: "O site de",
  gateB: "está temporariamente indisponível. Se você é o proprietário, assine um plano na sua conta SeekerAi e ele volta ao ar imediatamente.",
  gateCta: "Criado com SeekerAi →",
};

const EN: SiteStrings = {
  navPortfolio: "Portfolio", navDuvidas: "Questions", navContato: "Contact",
  heroTop: "A place for you", scrollConhecer: (p) => `Scroll to explore ${p}`,
  reelsEyebrow: "On reels", sobConsulta: "On request", ofertasEyebrow: "Only here",
  portfolioEyebrow: "Portfolio", corridorA: "Details that", corridorB: "make the difference",
  trabalhosA: "Work", emDestaque: "in the spotlight", experienciaEyebrow: "The experience",
  pensadoA: "Crafted for the", pensadoB: "details", equipeEyebrow: "Who takes care of you",
  equipeA: "Our", equipeB: "team", profissional: "Professional",
  reviewsTotal: (t, f) => `${t} reviews on ${f}`,
  reviewsReal: (t, f) => `${t} real ${f} reviews`,
  recadoCliente: "Real customer note · WhatsApp", recadoAlt: "Real customer note",
  ctaAgendar: "Book now", catFallback: "Services", ofertas: "Offers",
  prepFallback: "the space", marqueeFallback: "A place made for you",
  servicosTitleFb: "Pick your", momentoFb: "moment", ctaEmFb: "treat yourself",
  serviceNote: "Prices and availability confirmed on WhatsApp — no commitment.",
  ondeEstamos: "Where we are", esperamosA: "We'll see you", esperamosB: "here",
  endereco: "Address", horarios: "Hours", contato: "Contact",
  abrirMaps: "Open in Google Maps", chamarWa: "Message on WhatsApp", ligar: "Call now", ligarShort: "Call",
  duvidas: "Questions", faqA: "Frequently asked", faqB: "questions",
  footerA: "Your moment to", feitoCom: "Made with", por: "by",
  voltarTopo: "Back to top", fechar: "Close", anterior: "Previous", proxima: "Next", arraste: "← drag →",
  waFloatMsg: (n) => `Hi! I found ${n} online ✨`,
  waServicoMsg: (p, n) => `Hi! I came across ${p} online and I'd like to know more about ${n}.`,
  dealAproveitar: "Get it", dealQuero: "I want it",
  agendamento: "Booking", reserveA: "Book your", reserveB: "spot",
  stepServico: "1. Choose a service", stepProf: "2. Who do you prefer?", stepData: "Pick a date",
  stepHora: "Pick a time", stepConfirma: "Confirm on WhatsApp",
  semPref: "No preference", primeiraDisp: "First available",
  sumServico: "Service", sumProf: "Professional", sumData: "Date", sumHora: "Time",
  sumNome: "Name", sumTel: "Phone",
  seuNome: "Your name", nomePh: "What should we call you?", seuWhats: "Your WhatsApp (optional)", telPh: "(555) 123-4567",
  voltar: "Back", continuar: "Continue", enviarWhats: "Send on WhatsApp",
  bookMsg: "The message is pre-filled with your choices — just send it and we'll confirm right away.",
  errNome: "Please enter your name so we can identify your booking.",
  errServico: "Pick a service to continue.",
  errProf: "Pick a professional or 'No preference'.",
  errData: "Pick a date.", errHora: "Pick a time.",
  semHorarios: "No free slots that day — pick another date.",
  visitEyebrow: "Visit us", visitTitle: (p) => `See you ${p}`,
  tracaRota: "Get directions", comoChegar: "Directions",
  waBookHello: (n) => `Hi! I'd like to book at ${n} ✨`,
  dows: ["sun", "mon", "tue", "wed", "thu", "fri", "sat"],
  navHistoria: "Our story", navGaleria: "Gallery", navServicos: "Services",
  ctaAgendarHorario: "Book a slot", cidadeFb: "Barbershop",
  heroDesc: "Pick your service, your time and confirm straight on WhatsApp. No app, no signup — the way it should be.",
  scrollHistoria: "Scroll for our story", equipeCap: "The crew",
  equipeAlt: (n) => `The ${n} crew`, heroAlt: "crew and space",
  marqueeBarber: "Since the first cut", nossaHistoria: "Our story",
  deOndeViemos: "Where we came from", corridorBarberEyebrow: "The daily grind",
  corridorBarberA: "Every cut tells", corridorBarberB: "a story",
  galeriaEyebrow: "Gallery", porDentroA: "Inside",
  fotoCap: (i) => `Photo ${i} · enlarge`,
  servicosEyebrow: "Services", oQueFazemosA: "What we do", deMelhorB: "best",
  valorBalcao: "Price in store", cadaDetalheA: "Every detail", contaB: "counts",
  passaAquiA: "Come", footerBarberA: "Time for a", footerBarberB: "fresh look?",
  agendarAgora: "Book now", direitos: "All rights reserved",
  waBarberFloat: (n) => `Hi! I found ${n} online 💈`,
  reserveBarberA: "Book in", reserveBarberB: "30 seconds",
  stepProfBarber: "2. Choose your barber", primeiroDisp: "First available",
  barbeiro: "Barber",
  gateTitle: "Site paused",
  gateA: "The website of",
  gateB: "is temporarily unavailable. If you're the owner, subscribe to a plan on your SeekerAi account and it goes back online immediately.",
  gateCta: "Built with SeekerAi →",
};

const ES: SiteStrings = {
  navPortfolio: "Portafolio", navDuvidas: "Dudas", navContato: "Contacto",
  heroTop: "Un lugar para ti", scrollConhecer: (p) => `Desliza para conocer ${p}`,
  reelsEyebrow: "En reels", sobConsulta: "Bajo consulta", ofertasEyebrow: "Solo aquí",
  portfolioEyebrow: "Portafolio", corridorA: "Detalles que", corridorB: "marcan la diferencia",
  trabalhosA: "Trabajos", emDestaque: "destacados", experienciaEyebrow: "La experiencia",
  pensadoA: "Pensado en los", pensadoB: "detalles", equipeEyebrow: "Quién te cuida",
  equipeA: "Nuestro", equipeB: "equipo", profissional: "Profesional",
  reviewsTotal: (t, f) => `${t} reseñas en ${f}`,
  reviewsReal: (t, f) => `${t} reseñas reales en ${f}`,
  recadoCliente: "Nota real de cliente · WhatsApp", recadoAlt: "Nota real de cliente",
  ctaAgendar: "Reservar", catFallback: "Servicios", ofertas: "Ofertas",
  prepFallback: "el espacio", marqueeFallback: "Un lugar hecho para ti",
  servicosTitleFb: "Elige tu", momentoFb: "momento", ctaEmFb: "consentirte",
  serviceNote: "Precios y disponibilidad confirmados por WhatsApp — sin compromiso.",
  ondeEstamos: "Dónde estamos", esperamosA: "Te esperamos", esperamosB: "aquí",
  endereco: "Dirección", horarios: "Horarios", contato: "Contacto",
  abrirMaps: "Abrir en Google Maps", chamarWa: "Escribir por WhatsApp", ligar: "Llamar ahora", ligarShort: "Llamar",
  duvidas: "Dudas", faqA: "Preguntas", faqB: "frecuentes",
  footerA: "Tu momento de", feitoCom: "Hecho con", por: "por",
  voltarTopo: "Volver arriba", fechar: "Cerrar", anterior: "Anterior", proxima: "Siguiente", arraste: "← arrastra →",
  waFloatMsg: (n) => `¡Hola! Encontré a ${n} en internet ✨`,
  waServicoMsg: (p, n) => `¡Hola! Vi el sitio de ${p} y quiero saber sobre ${n}.`,
  dealAproveitar: "Aprovechar", dealQuero: "La quiero",
  agendamento: "Reserva", reserveA: "Reserva tu", reserveB: "momento",
  stepServico: "1. Elige el servicio", stepProf: "2. ¿Con quién prefieres?", stepData: "Elige la fecha",
  stepHora: "Elige el horario", stepConfirma: "Confirma por WhatsApp",
  semPref: "Sin preferencia", primeiraDisp: "Primera disponible",
  sumServico: "Servicio", sumProf: "Profesional", sumData: "Fecha", sumHora: "Horario",
  sumNome: "Nombre", sumTel: "Teléfono",
  seuNome: "Tu nombre", nomePh: "¿Cómo te llamamos?", seuWhats: "Tu WhatsApp (opcional)", telPh: "600 123 456",
  voltar: "Volver", continuar: "Continuar", enviarWhats: "Enviar por WhatsApp",
  bookMsg: "El mensaje se arma con tus elecciones — solo envíalo y confirmamos al instante.",
  errNome: "Escribe tu nombre para identificar la reserva.",
  errServico: "Elige un servicio para continuar.",
  errProf: "Elige un profesional o 'Sin preferencia'.",
  errData: "Elige una fecha.", errHora: "Elige un horario.",
  semHorarios: "No hay horarios libres ese día — elige otra fecha.",
  visitEyebrow: "Visítanos", visitTitle: (p) => `Te esperamos ${p}`,
  tracaRota: "Cómo llegar", comoChegar: "Cómo llegar",
  waBookHello: (n) => `¡Hola! Quiero reservar en ${n} ✨`,
  dows: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  navHistoria: "Historia", navGaleria: "Galería", navServicos: "Servicios",
  ctaAgendarHorario: "Reservar horario", cidadeFb: "Barbería",
  heroDesc: "Elige tu servicio, tu horario y confirma directo por WhatsApp. Sin app, sin registro — como debe ser.",
  scrollHistoria: "Desliza para conocer nuestra historia", equipeCap: "El equipo",
  equipeAlt: (n) => `El equipo de ${n}`, heroAlt: "equipo y ambiente",
  marqueeBarber: "Desde el primer corte", nossaHistoria: "Nuestra historia",
  deOndeViemos: "De dónde venimos", corridorBarberEyebrow: "El día a día",
  corridorBarberA: "Cada corte cuenta", corridorBarberB: "una historia",
  galeriaEyebrow: "Galería", porDentroA: "Por dentro de",
  fotoCap: (i) => `Foto ${i} · ampliar`,
  servicosEyebrow: "Servicios", oQueFazemosA: "Lo que hacemos", deMelhorB: "mejor",
  valorBalcao: "Precio en tienda", cadaDetalheA: "Cada detalle", contaB: "cuenta",
  passaAquiA: "Pásate", footerBarberA: "¿Renovamos", footerBarberB: "el look?",
  agendarAgora: "Reservar ahora", direitos: "Todos los derechos",
  waBarberFloat: (n) => `¡Hola! Encontré a ${n} en internet 💈`,
  reserveBarberA: "Reserva en", reserveBarberB: "30 segundos",
  stepProfBarber: "2. Elige el profesional", primeiroDisp: "Primero disponible",
  barbeiro: "Barbero",
  gateTitle: "Sitio en pausa",
  gateA: "El sitio de",
  gateB: "no está disponible temporalmente. Si eres el propietario, suscríbete a un plan en tu cuenta SeekerAi y vuelve al aire de inmediato.",
  gateCta: "Creado con SeekerAi →",
};

const DICTS: Record<string, SiteStrings> = { pt: PT, en: EN, es: ES };

/** Strings do site pela lang do config — desconhecidas caem no inglês. */
export function siteStrings(lang: string | null | undefined): SiteStrings {
  return DICTS[lang ?? "pt"] ?? EN;
}

/** Locale do Intl.DateTimeFormat pra cada lang. */
export function siteLocale(lang: string | null | undefined): string {
  return { pt: "pt-BR", en: "en-US", es: "es-ES" }[lang ?? "pt"] ?? "en-US";
}

/** Formatação de preço na moeda do país do site (BRL/USD/EUR). */
export function siteMoney(lang: string | null | undefined): Intl.NumberFormat {
  const currency = { pt: "BRL", en: "USD", es: "EUR" }[lang ?? "pt"] ?? "USD";
  return new Intl.NumberFormat(siteLocale(lang), { style: "currency", currency });
}

/** "o estúdio" → "do estúdio" (pt) / "the studio" → "at the studio" (en) /
    "el estudio" → "del estudio" (es). */
export function conjLugar(prep: string, lang: string | null | undefined): string {
  const l = lang ?? "pt";
  if (l === "en") return `at ${prep}`;
  if (l === "es") return prep.replace(/^el /, "del ").replace(/^la /, "de la ").replace(/^un /, "de un ").replace(/^una /, "de una ");
  return prep.replace(/^o /, "do ").replace(/^a /, "da ");
}

/** "do estúdio" → "no estúdio" / "at the studio" → "at the studio" / "del estudio" → "en el estudio". */
export function conjNoLugar(de: string, lang: string | null | undefined): string {
  const l = lang ?? "pt";
  if (l === "en") return de; // "at the studio" já serve pros dois usos
  if (l === "es") return de.replace(/^del /, "en el ").replace(/^de la /, "en la ").replace(/^de un /, "en un ").replace(/^de una /, "en una ");
  return de.replace(/^do /, "no ").replace(/^da /, "na ");
}
