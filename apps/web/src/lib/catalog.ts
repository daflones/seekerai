import { findService } from "./service-catalog";

export { services } from "./service-catalog";

export const nicheGroups: { label: string; niches: string[] }[] = [
  { label: "Beleza e bem-estar", niches: ["Barbearias", "Clínicas de estética", "Salões de beleza", "Estúdios de tatuagem"] },
  { label: "Comida e bebida", niches: ["Restaurantes", "Pizzarias", "Padarias", "Cafeterias", "Hamburguerias", "Buffets e eventos", "Açougues", "Mercados e mercearias"] },
  { label: "Saúde e corpo", niches: ["Academias", "Studios de pilates", "Personal trainers", "Nutricionistas", "Psicólogos", "Clínicas odontológicas", "Clínicas veterinárias", "Pet shops", "Farmácias", "Óticas"] },
  { label: "Negócios e serviços", niches: ["Imobiliárias", "Escritórios de contabilidade", "Advocacia", "Arquitetura e interiores", "Agências de viagem", "Assistência técnica de celular", "Informática e eletrônicos"] },
  { label: "Educação", niches: ["Escolas de idiomas", "Escolas particulares", "Autoescolas", "Cursos profissionalizantes"] },
  { label: "Automotivo", niches: ["Oficinas mecânicas", "Lava jatos", "Estética automotiva", "Borracharias"] },
  { label: "Comércio e varejo", niches: ["Lojas de roupas", "Lojas de calçados", "Joalherias", "Floriculturas", "Móveis e decoração"] },
  { label: "Construção e reformas", niches: ["Construção e reformas", "Elétrica e hidráulica", "Pintura e acabamento"] },
  { label: "Hospedagem", niches: ["Hotéis e pousadas"] },
];

export const niches = nicheGroups.flatMap((group) => group.niches);

export interface DemoCity {
  label: string;
  region: string;
  /** Base ilustrativa de estabelecimentos locais. */
  businesses: number;
}

// Cidades agrupadas por estado (UF). A macro-região fica em `region` —
// nada consome esse campo hoje, mas o shape é compartilhado com os
// catálogos internacionais em catalog-i18n.
function ufGroup(
  uf: string, name: string, region: string, list: [string, number][],
): { region: string; cities: DemoCity[] } {
  return {
    region: `${name} (${uf})`,
    cities: list.map(([city, businesses]) => ({ label: `${city}, ${uf}`, region, businesses })),
  };
}

const brCityGroups: { region: string; cities: DemoCity[] }[] = [
  ufGroup("AC", "Acre", "Norte", [
    ["Rio Branco", 6000], ["Cruzeiro do Sul", 1500],
  ]),
  ufGroup("AL", "Alagoas", "Nordeste", [
    ["Maceió", 13000], ["Arapiraca", 4000], ["Rio Largo", 1800], ["Palmeira dos Índios", 1500],
  ]),
  ufGroup("AM", "Amazonas", "Norte", [
    ["Manaus", 18000], ["Itacoatiara", 1800], ["Manacapuru", 1800], ["Parintins", 1500],
  ]),
  ufGroup("AP", "Amapá", "Norte", [
    ["Macapá", 5000], ["Santana", 1500],
  ]),
  ufGroup("BA", "Bahia", "Nordeste", [
    ["Salvador", 38000], ["Feira de Santana", 9000], ["Vitória da Conquista", 6000],
    ["Camaçari", 5000], ["Itabuna", 4000], ["Juazeiro", 4000], ["Lauro de Freitas", 4000],
    ["Ilhéus", 3500], ["Jequié", 2500], ["Teixeira de Freitas", 2500], ["Alagoinhas", 2500],
    ["Barreiras", 3000], ["Porto Seguro", 3000], ["Simões Filho", 2000], ["Paulo Afonso", 2000],
    ["Eunápolis", 2000], ["Santo Antônio de Jesus", 2000], ["Valença", 1800], ["Candeias", 1500],
    ["Senhor do Bonfim", 1500], ["Jacobina", 1500], ["Itamaraju", 1500],
  ]),
  ufGroup("CE", "Ceará", "Nordeste", [
    ["Fortaleza", 36000], ["Caucaia", 6000], ["Juazeiro do Norte", 5000], ["Maracanaú", 4000],
    ["Sobral", 3500], ["Crato", 2500], ["Itapipoca", 2500], ["Maranguape", 2000],
    ["Iguatu", 2000], ["Quixadá", 2000], ["Quixeramobim", 2000], ["Aquiraz", 2000],
    ["Pacatuba", 1800], ["Russas", 1800], ["Canindé", 1500], ["Cascavel", 1500],
    ["Tianguá", 1500], ["Horizonte", 1500], ["São Gonçalo do Amarante", 1800],
  ]),
  ufGroup("DF", "Distrito Federal", "Centro-Oeste", [
    ["Brasília", 34000], ["Ceilândia", 6000], ["Taguatinga", 5000], ["Samambaia", 4500],
    ["Planaltina", 3000], ["Águas Claras", 3500], ["Gama", 2500], ["Sobradinho", 2500],
    ["Guará", 2000],
  ]),
  ufGroup("ES", "Espírito Santo", "Sudeste", [
    ["Vitória", 11000], ["Vila Velha", 8000], ["Serra", 7000], ["Cariacica", 6000],
    ["Cachoeiro de Itapemirim", 3500], ["Linhares", 3000], ["São Mateus", 2500],
    ["Colatina", 2500], ["Guarapari", 2500], ["Aracruz", 2000], ["Viana", 1800],
    ["Nova Venécia", 1500], ["Barra de São Francisco", 1200],
  ]),
  ufGroup("GO", "Goiás", "Centro-Oeste", [
    ["Goiânia", 21000], ["Aparecida de Goiânia", 9000], ["Anápolis", 7000], ["Rio Verde", 4000],
    ["Luziânia", 4000], ["Águas Lindas de Goiás", 3500], ["Valparaíso de Goiás", 3000],
    ["Trindade", 2500], ["Formosa", 2500], ["Novo Gama", 2000], ["Itumbiara", 2500],
    ["Senador Canedo", 2000], ["Catalão", 2000], ["Jataí", 2000], ["Planaltina", 2000],
    ["Caldas Novas", 2500], ["Santo Antônio do Descoberto", 1500], ["Goianésia", 1500],
    ["Cidade Ocidental", 1500], ["Mineiros", 1500], ["Cristalina", 1500], ["Inhumas", 1200],
  ]),
  ufGroup("MA", "Maranhão", "Nordeste", [
    ["São Luís", 14000], ["Imperatriz", 5000], ["Timon", 3000], ["Caxias", 2500],
    ["Codó", 2000], ["Paço do Lumiar", 2000], ["Açailândia", 2000], ["Bacabal", 1800],
    ["Balsas", 2000], ["Santa Inês", 1500], ["Pinheiro", 1500], ["Chapadinha", 1500],
    ["Barra do Corda", 1500],
  ]),
  ufGroup("MG", "Minas Gerais", "Sudeste", [
    ["Belo Horizonte", 42000], ["Uberlândia", 15000], ["Contagem", 12000], ["Juiz de Fora", 11000],
    ["Betim", 10000], ["Montes Claros", 8000], ["Ribeirão das Neves", 6000], ["Uberaba", 6000],
    ["Governador Valadares", 5500], ["Ipatinga", 5500], ["Sete Lagoas", 5000], ["Divinópolis", 4500],
    ["Santa Luzia", 4000], ["Ibirité", 3500], ["Poços de Caldas", 3500], ["Patos de Minas", 3000],
    ["Pouso Alegre", 3000], ["Teófilo Otoni", 2500], ["Barbacena", 2500], ["Sabará", 2500],
    ["Varginha", 3000], ["Conselheiro Lafaiete", 2500], ["Araguari", 2500], ["Itabira", 2500],
    ["Passos", 2500], ["Coronel Fabriciano", 2000], ["Muriaé", 2000], ["Ituiutaba", 2000],
    ["Araxá", 2000], ["Lavras", 2000], ["Itajubá", 2000], ["Nova Lima", 2000], ["Itaúna", 2000],
    ["Pará de Minas", 2000], ["Patrocínio", 1800], ["Caratinga", 1800], ["Nova Serrana", 2000],
    ["Manhuaçu", 1800], ["Ubá", 2000], ["São João del-Rei", 1800], ["Timóteo", 1800],
    ["Curvelo", 1800], ["Ouro Preto", 1800], ["Alfenas", 1800], ["João Monlevade", 1800],
    ["Viçosa", 1500], ["Leopoldina", 1200],
  ]),
  ufGroup("MS", "Mato Grosso do Sul", "Centro-Oeste", [
    ["Campo Grande", 12000], ["Dourados", 4500], ["Três Lagoas", 2500], ["Corumbá", 2000],
    ["Ponta Porã", 1800], ["Aquidauana", 1500], ["Nova Andradina", 1500], ["Sidrolândia", 1500],
    ["Naviraí", 1500], ["Paranaíba", 1200], ["Maracaju", 1200],
  ]),
  ufGroup("MT", "Mato Grosso", "Centro-Oeste", [
    ["Cuiabá", 10000], ["Várzea Grande", 6000], ["Rondonópolis", 4500], ["Sinop", 3000],
    ["Tangará da Serra", 2000], ["Cáceres", 1800], ["Lucas do Rio Verde", 1800],
    ["Sorriso", 2000], ["Alta Floresta", 1500], ["Barra do Garças", 1500], ["Nova Mutum", 1200],
    ["Primavera do Leste", 1500], ["Campo Verde", 1200], ["Peixoto de Azevedo", 1000],
  ]),
  ufGroup("PA", "Pará", "Norte", [
    ["Belém", 15000], ["Ananindeua", 9000], ["Santarém", 6000], ["Marabá", 5000],
    ["Parauapebas", 4000], ["Castanhal", 4000], ["Marituba", 3500], ["Abaetetuba", 3000],
    ["Cametá", 2500], ["Bragança", 2500], ["Barcarena", 2500], ["Altamira", 2500],
    ["Itaituba", 2000], ["Tucuruí", 2000], ["Redenção", 2000], ["Paragominas", 2000],
    ["Moju", 1800], ["Tailândia", 1800], ["Breves", 1800], ["Capanema", 1500],
    ["Xinguara", 1200], ["Tomé-Açu", 1200],
  ]),
  ufGroup("PB", "Paraíba", "Nordeste", [
    ["João Pessoa", 12000], ["Campina Grande", 8000], ["Santa Rita", 3000], ["Patos", 2500],
    ["Bayeux", 2000], ["Sousa", 1500], ["Cajazeiras", 1500], ["Cabedelo", 1800],
    ["Guarabira", 1500], ["Mamanguape", 1200], ["Pombal", 1000],
  ]),
  ufGroup("PE", "Pernambuco", "Nordeste", [
    ["Recife", 28000], ["Jaboatão dos Guararapes", 12000], ["Olinda", 7000], ["Caruaru", 7000],
    ["Petrolina", 7000], ["Paulista", 6000], ["Cabo de Santo Agostinho", 4000],
    ["Camaragibe", 3000], ["Garanhuns", 3000], ["Vitória de Santo Antão", 3000],
    ["Igarassu", 2500], ["São Lourenço da Mata", 2000], ["Santa Cruz do Capibaribe", 2000],
    ["Abreu e Lima", 2000], ["Arcoverde", 1800], ["Serra Talhada", 1800], ["Gravatá", 1800],
    ["Carpina", 1800], ["Goiana", 1800], ["Belo Jardim", 1500], ["Moreno", 1500],
    ["Pesqueira", 1500], ["Surubim", 1500],
  ]),
  ufGroup("PI", "Piauí", "Nordeste", [
    ["Teresina", 10000], ["Parnaíba", 3000], ["Picos", 1800], ["Floriano", 1500],
    ["Piripiri", 1500], ["Campo Maior", 1200], ["Barras", 1200], ["União", 1000],
  ]),
  ufGroup("PR", "Paraná", "Sul", [
    ["Curitiba", 32000], ["Londrina", 12000], ["Maringá", 9000], ["Ponta Grossa", 7000],
    ["Cascavel", 6000], ["São José dos Pinhais", 6000], ["Foz do Iguaçu", 5000],
    ["Colombo", 4500], ["Guarapuava", 3500], ["Paranaguá", 3000], ["Araucária", 3000],
    ["Toledo", 3000], ["Apucarana", 3000], ["Pinhais", 2500], ["Campo Largo", 2500],
    ["Umuarama", 2500], ["Francisco Beltrão", 2000], ["Piraquara", 2000], ["Cambé", 2000],
    ["Campo Mourão", 2000], ["Fazenda Rio Grande", 2000], ["Sarandi", 2000], ["Arapongas", 2000],
    ["Cianorte", 1800], ["Pato Branco", 1800], ["Castro", 1800], ["Telêmaco Borba", 1800],
    ["Rolândia", 1500], ["Marechal Cândido Rondon", 1500], ["Palmas", 1500], ["União da Vitória", 1500],
  ]),
  ufGroup("RJ", "Rio de Janeiro", "Sudeste", [
    ["Rio de Janeiro", 86000], ["São Gonçalo", 14000], ["Niterói", 14000], ["Duque de Caxias", 12000],
    ["Nova Iguaçu", 11000], ["Campos dos Goytacazes", 10000], ["Belford Roxo", 8000],
    ["São João de Meriti", 7000], ["Petrópolis", 6000], ["Volta Redonda", 5500], ["Magé", 5000],
    ["Macaé", 5000], ["Itaboraí", 5000], ["Cabo Frio", 4500], ["Angra dos Reis", 4000],
    ["Nova Friburgo", 4000], ["Maricá", 3500], ["Teresópolis", 3500], ["Barra Mansa", 3500],
    ["Mesquita", 3500], ["Nilópolis", 3000], ["Araruama", 3000], ["Resende", 3000],
    ["Queimados", 3000], ["Itaguaí", 3000], ["São Pedro da Aldeia", 2500], ["Itaperuna", 2000],
    ["Barra do Piraí", 2000], ["Saquarema", 2000], ["Rio das Ostras", 3000], ["Armação dos Búzios", 2500],
    ["Três Rios", 1800], ["Valença", 1800], ["Santo Antônio de Pádua", 1200],
  ]),
  ufGroup("RN", "Rio Grande do Norte", "Nordeste", [
    ["Natal", 12000], ["Mossoró", 6000], ["Parnamirim", 5000], ["São Gonçalo do Amarante", 2500],
    ["Macaíba", 2000], ["Ceará-Mirim", 1800], ["Caicó", 1800], ["Assu", 1500],
    ["Currais Novos", 1200], ["Nova Cruz", 1200], ["Santa Cruz", 1200],
  ]),
  ufGroup("RO", "Rondônia", "Norte", [
    ["Porto Velho", 10000], ["Ji-Paraná", 2500], ["Ariquemes", 2000], ["Vilhena", 2000],
    ["Cacoal", 1800], ["Jaru", 1200], ["Rolim de Moura", 1500], ["Pimenta Bueno", 1000],
  ]),
  ufGroup("RR", "Roraima", "Norte", [
    ["Boa Vista", 8000], ["Rorainópolis", 800], ["Caracaraí", 700],
  ]),
  ufGroup("RS", "Rio Grande do Sul", "Sul", [
    ["Porto Alegre", 30000], ["Caxias do Sul", 11000], ["Canoas", 8000], ["Pelotas", 7000],
    ["Santa Maria", 6000], ["Gravataí", 6000], ["Viamão", 5000], ["Novo Hamburgo", 5000],
    ["São Leopoldo", 4500], ["Rio Grande", 4000], ["Alvorada", 4000], ["Passo Fundo", 4000],
    ["Sapucaia do Sul", 3000], ["Uruguaiana", 3000], ["Santa Cruz do Sul", 3000],
    ["Cachoeirinha", 2500], ["Bagé", 2500], ["Bento Gonçalves", 2500], ["Erechim", 2500],
    ["Guaíba", 2500], ["Cachoeira do Sul", 2000], ["Santana do Livramento", 2000],
    ["Esteio", 2000], ["Ijuí", 2000], ["Sapiranga", 2000], ["Santo Ângelo", 1800],
    ["Alegrete", 1800], ["Lajeado", 2000], ["Santa Rosa", 1800], ["Venâncio Aires", 1800],
    ["Farroupilha", 2000], ["Cruz Alta", 1800], ["Vacaria", 1800], ["Carazinho", 1800],
    ["Campo Bom", 2000], ["Montenegro", 2000], ["São Borja", 1500], ["Camaquã", 1500],
    ["Capão da Canoa", 1500], ["Eldorado do Sul", 1200], ["Charqueadas", 1200],
    ["Parobé", 1500], ["Taquara", 1500], ["Igrejinha", 1200], ["Torres", 1200],
  ]),
  ufGroup("SC", "Santa Catarina", "Sul", [
    ["Florianópolis", 14000], ["Joinville", 13000], ["Blumenau", 8000], ["São José", 5000],
    ["Criciúma", 4500], ["Chapecó", 4500], ["Itajaí", 4500], ["Jaraguá do Sul", 3500],
    ["Lages", 3500], ["Palhoça", 3500], ["Balneário Camboriú", 3000], ["Brusque", 3000],
    ["Tubarão", 2500], ["Camboriú", 2500], ["São Bento do Sul", 2000], ["Caçador", 2000],
    ["Navegantes", 2000], ["Concórdia", 2000], ["Rio do Sul", 2000], ["Araranguá", 2000],
    ["Gaspar", 2000], ["Biguaçu", 2000], ["Indaial", 2000], ["Itapema", 2500], ["Mafra", 1500],
    ["Videira", 1500], ["Joaçaba", 1500], ["Xanxerê", 1500], ["São Miguel do Oeste", 1200],
    ["Canoinhas", 1500], ["Herval d'Oeste", 1000],
  ]),
  ufGroup("SE", "Sergipe", "Nordeste", [
    ["Aracaju", 10000], ["Nossa Senhora do Socorro", 3500], ["Lagarto", 2500],
    ["Itabaiana", 2000], ["Estância", 1500], ["Tobias Barreto", 1200], ["São Cristóvão", 1500],
  ]),
  ufGroup("SP", "São Paulo", "Sudeste", [
    ["São Paulo", 120000], ["Campinas", 28000], ["Ribeirão Preto", 19000], ["Guarulhos", 18000],
    ["São José dos Campos", 17000], ["Sorocaba", 15000], ["São Bernardo do Campo", 12000],
    ["Santos", 12000], ["Osasco", 12000], ["Santo André", 10000], ["São José do Rio Preto", 10000],
    ["Mogi das Cruzes", 9000], ["Jundiaí", 9000], ["Piracicaba", 9000], ["Bauru", 9000],
    ["Mauá", 8000], ["Diadema", 8000], ["Carapicuíba", 8000], ["Itaquaquecetuba", 7000],
    ["São Vicente", 7000], ["Franca", 7000], ["Guarujá", 7000], ["Taubaté", 7000],
    ["Praia Grande", 7000], ["Limeira", 7000], ["Suzano", 6000], ["Taboão da Serra", 6000],
    ["Sumaré", 6000], ["Barueri", 6000], ["Embu das Artes", 6000], ["São Carlos", 6000],
    ["Itapevi", 5500], ["Indaiatuba", 5000], ["Cotia", 5000], ["Americana", 5000],
    ["Araraquara", 5000], ["Jacareí", 5000], ["Presidente Prudente", 5000], ["Marília", 5000],
    ["Hortolândia", 5000], ["Rio Claro", 4500], ["Araçatuba", 4500], ["Santa Bárbara d'Oeste", 4500],
    ["Ferraz de Vasconcelos", 4000], ["Itu", 4000], ["Bragança Paulista", 4000],
    ["Francisco Morato", 4000], ["Pindamonhangaba", 4000], ["Itapetininga", 4000],
    ["Itapecerica da Serra", 4000], ["São Caetano do Sul", 4000], ["Mogi Guaçu", 3500],
    ["Franco da Rocha", 3500], ["Jaú", 3500], ["Botucatu", 3500], ["Atibaia", 3500],
    ["Arujá", 3000], ["Cubatão", 3000], ["Birigui", 3000], ["Votorantim", 3000],
    ["Várzea Paulista", 3000], ["Catanduva", 3000], ["Sertãozinho", 3000], ["Jandira", 3000],
    ["Barretos", 3000], ["Guaratinguetá", 3000], ["Caraguatatuba", 3000], ["Poá", 3000],
    ["Salto", 3000], ["Tatuí", 3000], ["Votuporanga", 2500], ["Mairiporã", 2500],
    ["São Roque", 2500], ["Caieiras", 2500], ["Santana de Parnaíba", 3500], ["Lorena", 2500],
    ["São Sebastião", 2500], ["Assis", 2500], ["Leme", 2500], ["Ourinhos", 2500],
    ["Itatiba", 3000], ["Mococa", 2000], ["Bebedouro", 2000], ["Avaré", 2000],
    ["Itapeva", 2000], ["Capão Bonito", 1500], ["Registro", 1500], ["Lençóis Paulista", 2000],
    ["Mirassol", 2000], ["Andradina", 1500], ["Penápolis", 1500], ["Fernandópolis", 1800],
    ["Jales", 1500], ["Olímpia", 1500], ["Batatais", 1800],
    ["Piedade", 1200], ["Peruíbe", 1500], ["Mongaguá", 2000], ["Itanhaém", 2000],
    ["Ubatuba", 2500], ["Campos do Jordão", 1500], ["Aparecida", 1200],
  ]),
  ufGroup("TO", "Tocantins", "Norte", [
    ["Palmas", 6000], ["Araguaína", 3500], ["Gurupi", 2000], ["Porto Nacional", 1500],
    ["Paraíso do Tocantins", 1500], ["Colinas do Tocantins", 1200],
  ]),
];

// As cidades que os usuários realmente buscam ficam no topo — primeiro o
// grupo fixo das metrópoles mais usadas, depois os estados em ordem de
// frequência/população (não alfabética). O grupo repete cidades que
// também constam no próprio estado — a lista flat deduplica por label.
const TOP_CITIES: [string, string, number][] = [
  ["São Paulo", "SP", 120000], ["Rio de Janeiro", "RJ", 86000],
  ["Belo Horizonte", "MG", 42000], ["Salvador", "BA", 38000],
  ["Fortaleza", "CE", 36000], ["Brasília", "DF", 34000],
  ["Curitiba", "PR", 32000], ["Porto Alegre", "RS", 30000],
  ["Recife", "PE", 28000], ["Campinas", "SP", 28000],
  ["Goiânia", "GO", 21000], ["Manaus", "AM", 18000],
  ["Florianópolis", "SC", 14000], ["Belém", "PA", 12000],
];

const UF_PRIORITY = [
  "SP", "RJ", "MG", "BA", "RS", "PR", "SC", "PE", "CE", "GO", "DF", "ES",
  "PA", "MA", "AM", "MT", "MS", "RN", "PB", "AL", "PI", "SE", "TO", "RO",
  "AC", "RR", "AP",
];

const ufRank = (region: string) => {
  const uf = /\(([A-Z]{2})\)$/.exec(region)?.[1];
  const i = uf ? UF_PRIORITY.indexOf(uf) : -1;
  return i < 0 ? UF_PRIORITY.length : i;
};

export const cityGroups: { region: string; cities: DemoCity[] }[] = [
  {
    region: "Mais buscadas",
    cities: TOP_CITIES.map(([city, uf, businesses]) => ({
      label: `${city}, ${uf}`, region: "Nacional", businesses,
    })),
  },
  ...[...brCityGroups].sort((a, b) => ufRank(a.region) - ufRank(b.region)),
];

export const cities = [...new Map(
  cityGroups.flatMap((group) => group.cities).map((c) => [c.label, c]),
).values()];

// Participação aproximada do nicho no comércio local (fração ilustrativa).
const nicheWeight: Record<string, number> = {
  Barbearias: 0.018, "Clínicas de estética": 0.012, "Salões de beleza": 0.02, "Estúdios de tatuagem": 0.006,
  Restaurantes: 0.032, Pizzarias: 0.01, Padarias: 0.008, Cafeterias: 0.006, Hamburguerias: 0.005,
  "Buffets e eventos": 0.004, "Açougues": 0.004, "Mercados e mercearias": 0.012,
  Academias: 0.012, "Studios de pilates": 0.006, "Personal trainers": 0.005, Nutricionistas: 0.004,
  "Psicólogos": 0.007, "Clínicas odontológicas": 0.014, "Clínicas veterinárias": 0.006,
  "Pet shops": 0.006, "Farmácias": 0.008, "Óticas": 0.003,
  "Imobiliárias": 0.01, "Escritórios de contabilidade": 0.008, Advocacia: 0.012,
  "Arquitetura e interiores": 0.004, "Agências de viagem": 0.003,
  "Assistência técnica de celular": 0.005, "Informática e eletrônicos": 0.005,
  "Escolas de idiomas": 0.003, "Escolas particulares": 0.004, Autoescolas: 0.003,
  "Cursos profissionalizantes": 0.004,
  "Oficinas mecânicas": 0.01, "Lava jatos": 0.004, "Estética automotiva": 0.003, Borracharias: 0.004,
  "Lojas de roupas": 0.014, "Lojas de calçados": 0.006, Joalherias: 0.003, Floriculturas: 0.003,
  "Móveis e decoração": 0.006,
  "Construção e reformas": 0.01, "Elétrica e hidráulica": 0.006, "Pintura e acabamento": 0.006,
  "Hotéis e pousadas": 0.006,
};

// Fração dos estabelecimentos do nicho que tipicamente precisa do serviço.
const serviceFit: Record<string, number> = {
  sites: 0.85, landing_pages: 0.8, ecommerce: 0.5, google_business: 0.8, seo: 0.7,
  automacao: 0.35, chatbots: 0.4,
  trafego: 0.55, social: 0.6, copywriting: 0.5, email_marketing: 0.4,
  gestao_whatsapp: 0.55, consultoria_marketing: 0.35,
  design: 0.6, branding: 0.55, fotografia: 0.45, gravacao_video: 0.4,
  edicao_video: 0.45, motion_design: 0.35, producao_conteudo: 0.5,
};

/** Estimativa numérica de leads potenciais: cidade × nicho × serviço. */
export function potentialEstimate(city: DemoCity, niche: string, service: string): number {
  return city.businesses * (nicheWeight[niche] ?? 0.008) * (serviceFit[service] ?? 0.5);
}

/** Estimativa ilustrativa de leads potenciais: cidade × nicho × serviço. */
export function formatPotential(city: DemoCity, niche: string, service: string): string {
  const estimate = potentialEstimate(city, niche, service);
  if (estimate >= 10_000) return `+${Math.round(estimate / 1000)} mil`;
  if (estimate >= 1_000) {
    const rounded = Math.round(estimate / 100) / 10;
    return `+${rounded.toLocaleString("pt-BR")} mil`;
  }
  return `+${Math.max(10, Math.round(estimate / 10) * 10)}`;
}

export type DemoLead = {
  id: string;
  name: string;
  category: string;
  initials: string;
  score: number;
  color: string;
  issue: string;
};

const names: Record<string, string[]> = {
  Barbearias: ["Barbearia Horizonte", "Studio do Barbeiro", "Barbearia Raiz"],
  "Clínicas de estética": ["Clínica Bem Viver", "Espaço Lumina", "Clínica Horizonte"],
  Restaurantes: ["Cozinha da Vila", "Bistrô Horizonte", "Casa do Sabor"],
  Academias: ["Movimento Studio", "Academia Horizonte", "Espaço Ativo"],
  "Pet shops": ["Pet da Vila", "Amigo de Patas", "Pet Horizonte"],
};

function fallbackNames(niche: string): string[] {
  const singular = niche.replace(/s$/, "");
  return [`${singular} Horizonte`, `Espaço ${singular.toLowerCase()}`, `${singular} da Vila`];
}

export function makeDemoLeads(niche: string, service: string): DemoLead[] {
  return (names[niche] ?? fallbackNames(niche)).map((name, i) => ({
    id: `demo-${i}`,
    name,
    category: niche,
    initials: name.split(" ").slice(0, 2).map((word) => word[0]).join(""),
    score: [96, 89, 84][i],
    color: ["violet", "cyan", "amber"][i],
    issue: service === "sites" ? "Sem site próprio" : findService(service)?.opportunity ?? "Sem site próprio",
  }));
}
