// reusable initerfaces & dataabase mapping
export interface BlogArticle {
  // addDate: string;
  articleId?: string;
  authorsByLine?: string;
  categories?: {name: string}[];
  claim?: string;
  clusterId?: string;
  companies?: {name: string}[];
  author?: string;
  content?: string;
  country?: string;
  description?: string;
  entities?: {data: string, type: string, mentions: number}[];
  imageUrl?: string;
  keywords?: {name: string, weight: number}[];
  labels?: {name: string}[];
  language?: string;
  links?: string[];
  locations?: {country: string}[];
  matchedAuthors?: {id: string, name: string}[];
  medium?: string;
  people?: {name: string}[];
  places?: string[];
  pubDate?: string;
  refreshDate?: string;
  reprint?: boolean;
  reprintGroupId?: string;
  score?: number;
  sentiment?: {positive: number, negative: number, neutral: number};
  source?: {domain: string, locations: {country: string, state: string, city: string, coordinates: {lat: number, long: number}}};
  summary?: string;
  title?: string;
  topics?: {name: string}[];
  translatedDescription?: string;
  translatedSummary?: string;
  translatedTitle?: string;
  translation?: string;
  url?: string;
  verdict?: string;
  date: Date | string;
  excerpt?: string;
}

export interface PricingSection {
  id?:    string;
  label?: string;
  rows:   string[];    // parsed from || delimiter by seed script
  content?: string;    // raw fallback when rows not yet seeded
}

export interface BlogEntry {
  id: string;
  title: string;
  author: string;
  content: string;
  image: string;
  topics: string[];
}

export interface Article {
  title: string;
  description: string;
  url: string;
  image: string;
  publishedAt: string;
  content: string;
  source: { name: string };
}

export interface Feed {
  entries?: BlogEntry[];
  articles: BlogArticle[];
  numResults: number;
  status: number;
}

export interface News {
  articles: Article[];
  date?: Date;
}

export interface FAQSection {
  question: string;
  answer: string;
}

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  education: string;
  practiceProfile: string;
  professionalAssociations: string[];
  communityInvolvement: string[];
  imageUrl: string;
}

export interface ProfileNav {
  display: string;
  value: string;
  order: number;
}

export interface DialogResult<T = any> {
  action: 'confirm' | 'cancel';
  message?: string;
  data?: T;
}

export interface AboutUsSchema {
  header: string
  subheader: string
  body: {
    content: string
    [k: string]: unknown
  }
  bulletpoints: string[]
  footer: {
    content: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

export interface AreasOfLawSchema {
  header: string
  subheader: string
  body: {
    content: string
    [k: string]: unknown
  }
  bulletpoints: string[]
  [k: string]: unknown
}

export interface HomePageSchema {
  header: string
  subheader: string
  body: {
    content: string
    [k: string]: unknown
  }
  bulletpoints: string[]
  footer: {
    content: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

export interface PricingPageSchema {
  header: string
  subheader: string
  sections: {
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^.*$".
     */
    [k: string]: {
      label: string
      content: string
      [k: string]: unknown
    }
  }
  [k: string]: unknown
}

export interface TeamProfileSchema {
  /**
   * This interface was referenced by `undefined`'s JSON-Schema definition
   * via the `patternProperty` "^.*$".
   */
  [k: string]: {
    id: string
    name: string
    image: string
    education: string
    calltobar: string
    workexperience: string
    achievements?: string[]
    community?: string[]
    role?: string
    [k: string]: unknown
  }
}

export interface SiteMetadata {
  metadata: {
    aboutPage: AboutUsSchema;
    areasOfLawPage: AreasOfLawSchema;
    homePage: HomePageSchema;
    pricingPage: PricingPageSchema;
    teamProfiles: TeamProfileSchema;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface SimpleSection {
  content: string;
}


export interface SiteContent {
  id?: string;
  page?: string;
  section?: string;
  position?: string;
  bulletpoints?: string[];
  tag?: string;
  title?: SiteSection | SimpleSection;
  subtitle?: SiteSection | SimpleSection;
  body?: SiteSection | SimpleSection | ContentSection;
  footer?: SiteSection | SimpleSection;
  images?: string[];
  links?: SiteSection | string[];
  lastupdated?: string;
  approved?: boolean;
  header?: SiteSection | SimpleSection;
  subheader?: SiteSection | SimpleSection;
  faqs?: FAQSection[];
}


export interface SiteSection {
  id:            string;
  page?:         string;
  header?:       string;
  subheader?:    string;
  body?:         string;
  intro?:        string;
  footer?:       string;
  bulletpoints?: string[];
  faqs?:         { question: string; answer: string }[];
  sections?:     { id?: string; label: string; rows: string[] }[];
  [key: string]: unknown;
  contents?: { sections: SiteSection[] };
  content?: string | string[];
  label?: string;
  options?: any;
}


export interface ContentSection {
  contents?: { sections: SiteSection[] };
  content?: string | string[];
  label?: string;
  options?: any;
  id?: any;
}


export interface BlogPost {
  id:        string;
  title:     string;
  date:      string;
  author:    string;
  category:  string;
  excerpt:   string;
  content:   string;
  imageUrl?: string;
  createdAt: string;
}

export interface Profile {
  id:             string;
  name:           string;
  image?:          string;
  role?:           string;
  education?:      string;
  calltobar?:      string;
  workexperience?: string;
  achievements?:   string[];
  community?:      string[];
}

export type NotificationAudience = 'all' | 'lawyers' | 'editors';
export type NotificationType = 'feature' | 'info' | 'warning';
export type NotificationStatus = 'active' | 'archived';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  audience: NotificationAudience;
  status: NotificationStatus;
  cta?: {
    label: string;
    url: string;
  };
  createdAt: string; // ISO
  expiresAt?: string; // ISO — optional TTL
  authorId?: string;
}

/** Shape stored in Firebase under /notificationReads/{uid}/{notifId} */
export interface NotificationReadRecord {
  readAt: string;
  uid: string;
}
 
/** Client-side enriched model */
export interface NotificationViewModel extends AppNotification {
  isRead: boolean;
  isDismissed: boolean; // session-only, not persisted
}

export type TabId =
  | 'purchase-mortgage'
  | 'cash-purchase'
  | 'sale'
  | 'refinance'
  | 'wills'
  | 'incorporation';

export interface ResultLine {
  label: string;
  value: number;
  muted?: boolean;
}

export interface CalcResult {
  lines: ResultLine[];
  total: number;
  quoteOnly?: boolean;
  quoteNote?: string;
  footnote?: string;
}

