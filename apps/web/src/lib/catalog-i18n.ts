// Catálogos localizados: serviços, nichos, cidades por região e textos de plano.
// Os valores PT são canônicos (banco/chaves); cada idioma mapeia pra exibição e busca.
import type { Lang, Locale } from "./i18n/shared";
import { cityGroups as brCityGroups, nicheGroups as brNicheGroups, type DemoCity } from "./catalog";

/* ─── Serviços (slug → nome por idioma) ─── */

const SERVICE_NAMES: Record<string, Partial<Record<Lang, string>>> = {
  sites: { en: "Website creation", es: "Creación de sitios web", fr: "Création de sites web", de: "Website-Erstellung", it: "Creazione di siti web" },
  landing_pages: { en: "Landing pages", es: "Landing pages", fr: "Landing pages", de: "Landingpages", it: "Landing page" },
  ecommerce: { en: "Online stores & e-commerce", es: "Tiendas online y e-commerce", fr: "Boutiques en ligne et e-commerce", de: "Onlineshops & E-Commerce", it: "Negozi online ed e-commerce" },
  automacao: { en: "Process automation", es: "Automatización de procesos", fr: "Automatisation des processus", de: "Prozessautomatisierung", it: "Automazione dei processi" },
  chatbots: { en: "Chatbots & AI agents", es: "Chatbots y agentes de IA", fr: "Chatbots et agents IA", de: "Chatbots & KI-Agenten", it: "Chatbot e agenti IA" },
  trafego: { en: "Paid traffic", es: "Tráfico pago", fr: "Trafic payant", de: "Paid Traffic", it: "Traffico a pagamento" },
  social: { en: "Social media management", es: "Gestión de redes sociales", fr: "Gestion des réseaux sociaux", de: "Social-Media-Management", it: "Gestione dei social media" },
  seo: { en: "SEO & organic search", es: "SEO y búsqueda orgánica", fr: "SEO et recherche organique", de: "SEO & organische Suche", it: "SEO e ricerca organica" },
  google_business: { en: "Google Business Profile", es: "Perfil de Empresa en Google", fr: "Fiche d'établissement Google", de: "Google-Unternehmensprofil", it: "Profilo dell'attività su Google" },
  copywriting: { en: "Copywriting & sales copy", es: "Copywriting y textos de venta", fr: "Copywriting et textes de vente", de: "Copywriting & Verkaufstexte", it: "Copywriting e testi di vendita" },
  email_marketing: { en: "Email marketing & CRM", es: "Email marketing y CRM", fr: "E-mail marketing et CRM", de: "E-Mail-Marketing & CRM", it: "Email marketing e CRM" },
  gestao_whatsapp: { en: "WhatsApp sales & support", es: "Atención y ventas por WhatsApp", fr: "Vente et support WhatsApp", de: "WhatsApp-Vertrieb & -Support", it: "Vendite e assistenza WhatsApp" },
  consultoria_marketing: { en: "Marketing consulting", es: "Consultoría de marketing", fr: "Conseil en marketing", de: "Marketingberatung", it: "Consulenza di marketing" },
  design: { en: "Graphic design", es: "Diseño gráfico", fr: "Design graphique", de: "Grafikdesign", it: "Graphic design" },
  branding: { en: "Branding & visual identity", es: "Branding e identidad visual", fr: "Branding et identité visuelle", de: "Branding & visuelle Identität", it: "Branding e identità visiva" },
  edicao_video: { en: "Video editing", es: "Edición de vídeo", fr: "Montage vidéo", de: "Videoschnitt", it: "Montaggio video" },
  gravacao_video: { en: "Video production", es: "Grabación y producción de vídeo", fr: "Production vidéo", de: "Videoproduktion", it: "Produzione video" },
  fotografia: { en: "Commercial photography", es: "Fotografía comercial", fr: "Photographie commerciale", de: "Werbefotografie", it: "Fotografia commerciale" },
  motion_design: { en: "Motion design & animation", es: "Motion design y animación", fr: "Motion design et animation", de: "Motion Design & Animation", it: "Motion design e animazione" },
  producao_conteudo: { en: "Content production & UGC", es: "Producción de contenido y UGC", fr: "Production de contenu et UGC", de: "Content-Produktion & UGC", it: "Produzione di contenuti e UGC" },
};

const SERVICE_CATEGORIES: Record<string, Partial<Record<Lang, string>>> = {
  "Web e tecnologia": { en: "Web & technology", es: "Web y tecnología", fr: "Web et technologie", de: "Web & Technologie", it: "Web e tecnologia" },
  "Marketing e vendas": { en: "Marketing & sales", es: "Marketing y ventas", fr: "Marketing et ventes", de: "Marketing & Vertrieb", it: "Marketing e vendite" },
  "Design e audiovisual": { en: "Design & audiovisual", es: "Diseño y audiovisual", fr: "Design et audiovisuel", de: "Design & Audiovisuelles", it: "Design e audiovisivi" },
};

export function serviceName(slug: string, ptFallback: string, lang: Lang): string {
  return lang === "pt" ? ptFallback : (SERVICE_NAMES[slug]?.[lang] ?? ptFallback);
}

export function serviceCategory(categoria: string, lang: Lang): string {
  return lang === "pt" ? categoria : (SERVICE_CATEGORIES[categoria]?.[lang] ?? categoria);
}

/* ─── Nichos (PT canônico → idiomas; o valor enviado na busca é o localizado) ─── */

const NICHE_I18N: Record<string, Partial<Record<Lang, string>>> = {
  Barbearias: { en: "Barbershops", es: "Barberías", fr: "Salons de coiffure homme", de: "Barbershops", it: "Barbieri" },
  "Clínicas de estética": { en: "Beauty clinics", es: "Clínicas de estética", fr: "Instituts de beauté", de: "Kosmetikkliniken", it: "Centri estetici" },
  "Salões de beleza": { en: "Hair salons", es: "Peluquerías", fr: "Salons de coiffure", de: "Friseursalons", it: "Parrucchieri" },
  "Estúdios de tatuagem": { en: "Tattoo studios", es: "Estudios de tatuaje", fr: "Studios de tatouage", de: "Tattoo-Studios", it: "Studi di tatuaggi" },
  Restaurantes: { en: "Restaurants", es: "Restaurantes", fr: "Restaurants", de: "Restaurants", it: "Ristoranti" },
  Pizzarias: { en: "Pizzerias", es: "Pizzerías", fr: "Pizzerias", de: "Pizzerien", it: "Pizzerie" },
  Padarias: { en: "Bakeries", es: "Panaderías", fr: "Boulangeries", de: "Bäckereien", it: "Panetterie" },
  Cafeterias: { en: "Coffee shops", es: "Cafeterías", fr: "Coffee shops", de: "Cafés", it: "Caffetterie" },
  Hamburguerias: { en: "Burger joints", es: "Hamburgueserías", fr: "Burger restaurants", de: "Burger-Restaurants", it: "Hamburgerie" },
  "Buffets e eventos": { en: "Catering & events", es: "Buffets y eventos", fr: "Traiteurs et événements", de: "Catering & Events", it: "Catering ed eventi" },
  Açougues: { en: "Butcher shops", es: "Carnicerías", fr: "Boucheries", de: "Metzgereien", it: "Macellerie" },
  "Mercados e mercearias": { en: "Grocery stores", es: "Supermercados y tiendas", fr: "Épiceries et supérettes", de: "Lebensmittelgeschäfte", it: "Mercati e alimentari" },
  Academias: { en: "Gyms", es: "Gimnasios", fr: "Salles de sport", de: "Fitnessstudios", it: "Palestre" },
  "Studios de pilates": { en: "Pilates studios", es: "Estudios de pilates", fr: "Studios de pilates", de: "Pilates-Studios", it: "Studi di pilates" },
  "Personal trainers": { en: "Personal trainers", es: "Entrenadores personales", fr: "Coachs sportifs", de: "Personal Trainer", it: "Personal trainer" },
  Nutricionistas: { en: "Nutritionists", es: "Nutricionistas", fr: "Nutritionnistes", de: "Ernährungsberater", it: "Nutrizionisti" },
  Psicólogos: { en: "Psychologists", es: "Psicólogos", fr: "Psychologues", de: "Psychologen", it: "Psicologi" },
  "Clínicas odontológicas": { en: "Dental clinics", es: "Clínicas dentales", fr: "Cabinets dentaires", de: "Zahnkliniken", it: "Cliniche odontoiatriche" },
  "Clínicas veterinárias": { en: "Veterinary clinics", es: "Clínicas veterinarias", fr: "Cliniques vétérinaires", de: "Tierkliniken", it: "Cliniche veterinarie" },
  "Pet shops": { en: "Pet shops", es: "Tiendas de mascotas", fr: "Animaleries", de: "Zoofachgeschäfte", it: "Pet shop" },
  Farmácias: { en: "Pharmacies", es: "Farmacias", fr: "Pharmacies", de: "Apotheken", it: "Farmacie" },
  Óticas: { en: "Opticians", es: "Ópticas", fr: "Opticiens", de: "Optiker", it: "Ottici" },
  Imobiliárias: { en: "Real estate agencies", es: "Inmobiliarias", fr: "Agences immobilières", de: "Immobilienbüros", it: "Agenzie immobiliari" },
  "Escritórios de contabilidade": { en: "Accounting firms", es: "Despachos contables", fr: "Cabinets comptables", de: "Steuerberatungsbüros", it: "Studi contabili" },
  Advocacia: { en: "Law firms", es: "Bufetes de abogados", fr: "Cabinets d'avocats", de: "Anwaltskanzleien", it: "Studi legali" },
  "Arquitetura e interiores": { en: "Architecture & interiors", es: "Arquitectura e interiores", fr: "Architecture et intérieur", de: "Architektur & Inneneinrichtung", it: "Architettura e interni" },
  "Agências de viagem": { en: "Travel agencies", es: "Agencias de viajes", fr: "Agences de voyage", de: "Reisebüros", it: "Agenzie di viaggio" },
  "Assistência técnica de celular": { en: "Phone repair shops", es: "Reparación de celulares", fr: "Réparation de téléphones", de: "Handyreparatur", it: "Riparazione cellulari" },
  "Informática e eletrônicos": { en: "Computer & electronics", es: "Informática y electrónica", fr: "Informatique et électronique", de: "Computer & Elektronik", it: "Informatica ed elettronica" },
  "Escolas de idiomas": { en: "Language schools", es: "Escuelas de idiomas", fr: "Écoles de langues", de: "Sprachschulen", it: "Scuole di lingue" },
  "Escolas particulares": { en: "Private schools", es: "Escuelas privadas", fr: "Écoles privées", de: "Privatschulen", it: "Scuole private" },
  Autoescolas: { en: "Driving schools", es: "Autoescuelas", fr: "Auto-écoles", de: "Fahrschulen", it: "Autoscuole" },
  "Cursos profissionalizantes": { en: "Vocational courses", es: "Cursos profesionales", fr: "Formations professionnelles", de: "Berufskurse", it: "Corsi professionali" },
  "Oficinas mecânicas": { en: "Auto repair shops", es: "Talleres mecánicos", fr: "Garages mécaniques", de: "Autowerkstätten", it: "Officine meccaniche" },
  "Lava jatos": { en: "Car washes", es: "Lavados de autos", fr: "Stations de lavage", de: "Autowaschanlagen", it: "Autolavaggi" },
  "Estética automotiva": { en: "Car detailing", es: "Estética automotriz", fr: "Detailing automobile", de: "Fahrzeugaufbereitung", it: "Detailing auto" },
  Borracharias: { en: "Tire shops", es: "Vulcanizadoras", fr: "Centres de pneus", de: "Reifenhändler", it: "Gommisti" },
  "Lojas de roupas": { en: "Clothing stores", es: "Tiendas de ropa", fr: "Magasins de vêtements", de: "Bekleidungsgeschäfte", it: "Negozi di abbigliamento" },
  "Lojas de calçados": { en: "Shoe stores", es: "Zapaterías", fr: "Magasins de chaussures", de: "Schuhgeschäfte", it: "Negozi di scarpe" },
  Joalherias: { en: "Jewelry stores", es: "Joyerías", fr: "Bijouteries", de: "Juweliere", it: "Gioiellerie" },
  Floriculturas: { en: "Flower shops", es: "Floristerías", fr: "Fleuristes", de: "Blumengeschäfte", it: "Fiorai" },
  "Móveis e decoração": { en: "Furniture & decor", es: "Muebles y decoración", fr: "Meubles et décoration", de: "Möbel & Deko", it: "Mobili e decorazione" },
  "Construção e reformas": { en: "Construction & renovation", es: "Construcción y reformas", fr: "Construction et rénovation", de: "Bau & Renovierung", it: "Costruzioni e ristrutturazioni" },
  "Elétrica e hidráulica": { en: "Electrical & plumbing", es: "Electricidad y fontanería", fr: "Électricité et plomberie", de: "Elektro & Sanitär", it: "Elettricisti e idraulici" },
  "Pintura e acabamento": { en: "Painting & finishing", es: "Pintura y acabados", fr: "Peinture et finition", de: "Maler & Lackierer", it: "Pittura e finiture" },
  "Hotéis e pousadas": { en: "Hotels & inns", es: "Hoteles y hostales", fr: "Hôtels et auberges", de: "Hotels & Pensionen", it: "Hotel e locande" },
};

const NICHE_GROUP_LABELS: Record<string, Partial<Record<Lang, string>>> = {
  "Beleza e bem-estar": { en: "Beauty & wellness", es: "Belleza y bienestar", fr: "Beauté et bien-être", de: "Beauty & Wellness", it: "Bellezza e benessere" },
  "Comida e bebida": { en: "Food & drink", es: "Comida y bebida", fr: "Nourriture et boissons", de: "Essen & Trinken", it: "Cibo e bevande" },
  "Saúde e corpo": { en: "Health & body", es: "Salud y cuerpo", fr: "Santé et corps", de: "Gesundheit & Körper", it: "Salute e corpo" },
  "Negócios e serviços": { en: "Business & services", es: "Negocios y servicios", fr: "Affaires et services", de: "Business & Dienstleistungen", it: "Affari e servizi" },
  Educação: { en: "Education", es: "Educación", fr: "Éducation", de: "Bildung", it: "Istruzione" },
  Automotivo: { en: "Automotive", es: "Automoción", fr: "Automobile", de: "Automobil", it: "Automotive" },
  "Comércio e varejo": { en: "Retail & commerce", es: "Comercio y venta minorista", fr: "Commerce et vente", de: "Handel & Einzelhandel", it: "Commercio e vendita" },
  "Construção e reformas": { en: "Construction & renovation", es: "Construcción y reformas", fr: "Construction et rénovation", de: "Bau & Renovierung", it: "Costruzioni e ristrutturazioni" },
  Hospedagem: { en: "Hospitality", es: "Hostelería", fr: "Hébergement", de: "Beherbergung", it: "Ospitalità" },
};

export interface NicheOption { label: string; canonical: string }
export interface NicheGroupOption { label: string; options: NicheOption[] }

/** Nichos traduzidos pro idioma — `canonical` é a chave PT usada nos pesos. */
export function nicheGroupsFor(lang: Lang): NicheGroupOption[] {
  return brNicheGroups.map((group) => ({
    label: lang === "pt" ? group.label : (NICHE_GROUP_LABELS[group.label]?.[lang] ?? group.label),
    options: group.niches.map((n) => ({
      label: lang === "pt" ? n : (NICHE_I18N[n]?.[lang] ?? n),
      canonical: n,
    })),
  }));
}

/* ─── Cidades por região/país ─── */

const ptCityGroups = [
  { region: "Portugal", cities: [
    { label: "Lisboa", region: "Portugal", businesses: 45000 },
    { label: "Porto", region: "Portugal", businesses: 28000 },
    { label: "Braga", region: "Portugal", businesses: 8000 },
    { label: "Coimbra", region: "Portugal", businesses: 7000 },
    { label: "Faro", region: "Portugal", businesses: 5000 },
    { label: "Funchal", region: "Portugal", businesses: 6000 },
    { label: "Aveiro", region: "Portugal", businesses: 5000 },
    { label: "Setúbal", region: "Portugal", businesses: 6000 },
  ] },
];

const usCityGroups = [
  { region: "United States", cities: [
    { label: "New York, NY", region: "United States", businesses: 180000 },
    { label: "Los Angeles, CA", region: "United States", businesses: 120000 },
    { label: "Chicago, IL", region: "United States", businesses: 95000 },
    { label: "Houston, TX", region: "United States", businesses: 80000 },
    { label: "Miami, FL", region: "United States", businesses: 60000 },
    { label: "Phoenix, AZ", region: "United States", businesses: 45000 },
    { label: "Dallas, TX", region: "United States", businesses: 55000 },
    { label: "Atlanta, GA", region: "United States", businesses: 40000 },
    { label: "Denver, CO", region: "United States", businesses: 30000 },
    { label: "Seattle, WA", region: "United States", businesses: 35000 },
  ] },
];

const gbCityGroups = [
  { region: "United Kingdom", cities: [
    { label: "London", region: "United Kingdom", businesses: 140000 },
    { label: "Manchester", region: "United Kingdom", businesses: 35000 },
    { label: "Birmingham", region: "United Kingdom", businesses: 32000 },
    { label: "Leeds", region: "United Kingdom", businesses: 20000 },
    { label: "Glasgow", region: "United Kingdom", businesses: 22000 },
    { label: "Liverpool", region: "United Kingdom", businesses: 18000 },
    { label: "Bristol", region: "United Kingdom", businesses: 16000 },
    { label: "Edinburgh", region: "United Kingdom", businesses: 15000 },
  ] },
];

const esCityGroups = [
  { region: "España", cities: [
    { label: "Madrid", region: "España", businesses: 90000 },
    { label: "Barcelona", region: "España", businesses: 75000 },
    { label: "Valencia", region: "España", businesses: 28000 },
    { label: "Sevilla", region: "España", businesses: 24000 },
    { label: "Bilbao", region: "España", businesses: 16000 },
    { label: "Málaga", region: "España", businesses: 18000 },
    { label: "Zaragoza", region: "España", businesses: 14000 },
  ] },
  { region: "Latinoamérica", cities: [
    { label: "Ciudad de México", region: "Latinoamérica", businesses: 150000 },
    { label: "Buenos Aires", region: "Latinoamérica", businesses: 90000 },
    { label: "Bogotá", region: "Latinoamérica", businesses: 70000 },
    { label: "Santiago", region: "Latinoamérica", businesses: 55000 },
    { label: "Lima", region: "Latinoamérica", businesses: 65000 },
    { label: "Guadalajara", region: "Latinoamérica", businesses: 40000 },
    { label: "Monterrey", region: "Latinoamérica", businesses: 35000 },
    { label: "Medellín", region: "Latinoamérica", businesses: 30000 },
  ] },
];

const frCityGroups = [
  { region: "France", cities: [
    { label: "Paris", region: "France", businesses: 110000 },
    { label: "Lyon", region: "France", businesses: 30000 },
    { label: "Marseille", region: "France", businesses: 28000 },
    { label: "Toulouse", region: "France", businesses: 20000 },
    { label: "Bordeaux", region: "France", businesses: 18000 },
    { label: "Nantes", region: "France", businesses: 17000 },
    { label: "Lille", region: "France", businesses: 16000 },
    { label: "Nice", region: "France", businesses: 15000 },
  ] },
];

const deCityGroups = [
  { region: "Deutschland", cities: [
    { label: "Berlin", region: "Deutschland", businesses: 85000 },
    { label: "Hamburg", region: "Deutschland", businesses: 45000 },
    { label: "München", region: "Deutschland", businesses: 55000 },
    { label: "Köln", region: "Deutschland", businesses: 30000 },
    { label: "Frankfurt am Main", region: "Deutschland", businesses: 28000 },
    { label: "Stuttgart", region: "Deutschland", businesses: 25000 },
    { label: "Düsseldorf", region: "Deutschland", businesses: 22000 },
    { label: "Leipzig", region: "Deutschland", businesses: 18000 },
  ] },
  { region: "Österreich & Schweiz", cities: [
    { label: "Wien", region: "Österreich & Schweiz", businesses: 40000 },
    { label: "Zürich", region: "Österreich & Schweiz", businesses: 25000 },
    { label: "Salzburg", region: "Österreich & Schweiz", businesses: 8000 },
    { label: "Genf", region: "Österreich & Schweiz", businesses: 12000 },
  ] },
];

const itCityGroups = [
  { region: "Italia", cities: [
    { label: "Roma", region: "Italia", businesses: 80000 },
    { label: "Milano", region: "Italia", businesses: 70000 },
    { label: "Napoli", region: "Italia", businesses: 35000 },
    { label: "Torino", region: "Italia", businesses: 30000 },
    { label: "Firenze", region: "Italia", businesses: 20000 },
    { label: "Bologna", region: "Italia", businesses: 18000 },
    { label: "Venezia", region: "Italia", businesses: 12000 },
    { label: "Palermo", region: "Italia", businesses: 15000 },
  ] },
];

/** Grupos de cidades conforme a região detectada do usuário. */
export function cityGroupsFor(loc: Locale): { region: string; cities: DemoCity[] }[] {
  const { region, lang } = loc;
  if (region === "BR") return brCityGroups;
  if (region === "PT") return ptCityGroups;
  if (region === "GB" || region === "IE") return gbCityGroups;
  if (region === "US" || region === "CA" || region === "AU" || region === "NZ") return usCityGroups;
  if (region === "ES" || lang === "es") return esCityGroups;
  if (region === "FR" || region === "BE" || lang === "fr") return frCityGroups;
  if (region === "DE" || region === "AT" || region === "CH" || lang === "de") return deCityGroups;
  if (region === "IT" || lang === "it") return itCityGroups;
  if (lang === "pt") return brCityGroups;
  if (lang === "en") return usCityGroups;
  return usCityGroups;
}

/* ─── Textos de plano (PT canônico → traduções) ─── */

const PLAN_TEXT: Record<string, Partial<Record<Lang, string>>> = {
  // nomes
  "Grátis": { en: "Free", es: "Gratis", fr: "Gratuit", de: "Kostenlos", it: "Gratis" },
  // badges
  "SEU PRIMEIRO PASSO": { en: "YOUR FIRST STEP", es: "TU PRIMER PASO", fr: "VOTRE PREMIER PAS", de: "DEIN ERSTER SCHRITT", it: "IL TUO PRIMO PASSO" },
  "PARA CRIAR CONSTÂNCIA": { en: "TO BUILD CONSISTENCY", es: "PARA CREAR CONSTANCIA", fr: "POUR CRÉER DE LA CONSTANCE", de: "FÜR KONSTANZ", it: "PER CREARE COSTANZA" },
  "MAIS POPULAR": { en: "MOST POPULAR", es: "MÁS POPULAR", fr: "LE PLUS POPULAIRE", de: "AM BELIEBTESTEN", it: "IL PIÙ POPOLARE" },
  "SEU PRÓXIMO NÍVEL": { en: "YOUR NEXT LEVEL", es: "TU PRÓXIMO NIVEL", fr: "VOTRE PROCHAIN NIVEAU", de: "DEIN NÄCHSTES LEVEL", it: "IL TUO PROSSIMO LIVELLO" },
  // CTAs
  "Começar grátis": { en: "Start for free", es: "Empezar gratis", fr: "Commencer gratuitement", de: "Kostenlos starten", it: "Inizia gratis" },
  "Escolher Essencial": { en: "Choose Essential", es: "Elegir Essential", fr: "Choisir Essential", de: "Essential wählen", it: "Scegli Essential" },
  "Quero o SeekerAi Pro": { en: "I want SeekerAi Pro", es: "Quiero SeekerAi Pro", fr: "Je veux SeekerAi Pro", de: "Ich will SeekerAi Pro", it: "Voglio SeekerAi Pro" },
  "Escolher King": { en: "Choose King", es: "Elegir King", fr: "Choisir King", de: "King wählen", it: "Scegli King" },
  // descrições
  "Conheça o radar. Encontre o seu próximo ponto de partida.": { en: "Meet the radar. Find your next starting point.", es: "Conoce el radar. Encuentra tu próximo punto de partida.", fr: "Découvrez le radar. Trouvez votre prochain point de départ.", de: "Lernen Sie das Radar kennen. Finden Sie Ihren nächsten Ausgangspunkt.", it: "Scopri il radar. Trova il tuo prossimo punto di partenza." },
  "Para quem está começando a prospectar com mais direção.": { en: "For those starting to prospect with more direction.", es: "Para quien empieza a prospectar con más dirección.", fr: "Pour ceux qui commencent à prospecter avec plus de direction.", de: "Für alle, die gezielter akquirieren wollen.", it: "Per chi inizia a prospectare con più direzione." },
  "Para quem quer mais contexto em cada negociação.": { en: "For those who want more context in every deal.", es: "Para quien quiere más contexto en cada negociación.", fr: "Pour ceux qui veulent plus de contexte dans chaque négociation.", de: "Für alle, die mehr Kontext in jeder Verhandlung wollen.", it: "Per chi vuole più contesto in ogni trattativa." },
  "Para quem prospecta com frequência e quer ir além.": { en: "For those who prospect often and want to go further.", es: "Para quien prospecta con frecuencia y quiere ir más allá.", fr: "Pour ceux qui prospectent souvent et veulent aller plus loin.", de: "Für Vielprospekteure, die weiter gehen wollen.", it: "Per chi prospecta spesso e vuole andare oltre." },
  // features
  "3 Buscas de lead Grátis + Geração de site e estratégia de acordo com o lead.": { en: "3 free lead searches + site and strategy generation per lead.", es: "3 búsquedas de leads gratis + generación de sitio y estrategia por lead.", fr: "3 recherches de leads gratuites + génération de site et stratégie par lead.", de: "3 kostenlose Lead-Suchen + Website- und Strategie-Generierung pro Lead.", it: "3 ricerche lead gratis + generazione di sito e strategia per lead." },
  "Sinais de oportunidade por serviço": { en: "Opportunity signals per service", es: "Señales de oportunidad por servicio", fr: "Signaux d'opportunité par service", de: "Opportunitätssignale pro Service", it: "Segnali di opportunità per servizio" },
  "Abordagens para iniciar conversas": { en: "Openers to start conversations", es: "Enfoques para iniciar conversaciones", fr: "Approches pour démarrer des conversations", de: "Ansprachen zum Gesprächsstart", it: "Approcci per avviare conversazioni" },
  "Sem cartão de crédito": { en: "No credit card required", es: "Sin tarjeta de crédito", fr: "Sans carte bancaire", de: "Keine Kreditkarte nötig", it: "Nessuna carta di credito" },
  "Até 10 leads por busca": { en: "Up to 10 leads per search", es: "Hasta 10 leads por búsqueda", fr: "Jusqu'à 10 leads par recherche", de: "Bis zu 10 Leads pro Suche", it: "Fino a 10 lead per ricerca" },
  "Até 30 leads por busca": { en: "Up to 30 leads per search", es: "Hasta 30 leads por búsqueda", fr: "Jusqu'à 30 leads par recherche", de: "Bis zu 30 Leads pro Suche", it: "Fino a 30 lead per ricerca" },
  "Até 50 leads por busca": { en: "Up to 50 leads per search", es: "Hasta 50 leads por búsqueda", fr: "Jusqu'à 50 leads par recherche", de: "Bis zu 50 Leads pro Suche", it: "Fino a 50 lead per ricerca" },
  "Agente de vendas com IA": { en: "AI sales agent", es: "Agente de ventas con IA", fr: "Agent commercial IA", de: "KI-Vertriebsagent", it: "Agente di vendita IA" },
  "Análise de oportunidades por negócio": { en: "Opportunity analysis per business", es: "Análisis de oportunidades por negocio", fr: "Analyse des opportunités par entreprise", de: "Opportunitätsanalyse pro Unternehmen", it: "Analisi delle opportunità per attività" },
  "Abordagens adaptadas ao seu serviço": { en: "Pitches tailored to your service", es: "Enfoques adaptados a tu servicio", fr: "Approches adaptées à votre service", de: "Ansprachen passend zu Ihrem Service", it: "Approcci adattati al tuo servizio" },
  "Leads salvos para continuar a conversa": { en: "Saved leads to keep the conversation going", es: "Leads guardados para continuar la conversación", fr: "Leads enregistrés pour poursuivre la conversation", de: "Gespeicherte Leads zum Weiterführen", it: "Lead salvati per continuare la conversazione" },
  "Portfólio sem a marca SeekerAi": { en: "Portfolio without SeekerAi branding", es: "Portafolio sin la marca SeekerAi", fr: "Portfolio sans la marque SeekerAi", de: "Portfolio ohne SeekerAi-Branding", it: "Portfolio senza il marchio SeekerAi" },
  "Tudo do plano Essencial": { en: "Everything in Essential", es: "Todo lo del plan Essential", fr: "Tout le plan Essential", de: "Alles aus Essential", it: "Tutto del piano Essential" },
  "Tudo do plano Pro": { en: "Everything in Pro", es: "Todo lo del plan Pro", fr: "Tout le plan Pro", de: "Alles aus Pro", it: "Tutto del piano Pro" },
  "Estratégias aprofundadas por negócio": { en: "In-depth strategies per business", es: "Estrategias profundas por negocio", fr: "Stratégies approfondies par entreprise", de: "Vertiefte Strategien pro Unternehmen", it: "Strategie approfondite per attività" },
  "Copiloto para apoiar suas chamadas": { en: "Copilot to support your calls", es: "Copiloto para apoyar tus llamadas", fr: "Copilote pour appuyer vos appels", de: "Copilot für Ihre Anrufe", it: "Copilota per supportare le tue chiamate" },
  "Histórico das suas conversas": { en: "Your conversation history", es: "Historial de tus conversaciones", fr: "Historique de vos conversations", de: "Ihr Gesprächsverlauf", it: "Cronologia delle tue conversazioni" },
  "Todos os modelos de portfólio": { en: "All portfolio themes", es: "Todos los modelos de portafolio", fr: "Tous les modèles de portfolio", de: "Alle Portfolio-Designs", it: "Tutti i temi portfolio" },
  "Mais capacidade para sua prospecção": { en: "More capacity for your prospecting", es: "Más capacidad para tu prospección", fr: "Plus de capacité pour votre prospection", de: "Mehr Kapazität für Ihre Akquise", it: "Più capacità per la tua prospezione" },
  "Trabalhos ilimitados no portfólio": { en: "Unlimited portfolio pieces", es: "Trabajos ilimitados en el portafolio", fr: "Réalisations illimitées au portfolio", de: "Unbegrenzte Portfolio-Projekte", it: "Lavori illimitati nel portfolio" },
  "Sua presença profissional, sem a marca": { en: "Your professional presence, unbranded", es: "Tu presencia profesional, sin la marca", fr: "Votre présence professionnelle, sans la marque", de: "Ihre professionelle Präsenz, markenfrei", it: "La tua presenza professionale, senza marchio" },
};

export function planText(pt: string, lang: Lang): string {
  return lang === "pt" ? pt : (PLAN_TEXT[pt]?.[lang] ?? pt);
}
