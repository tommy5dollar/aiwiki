export interface WikiStructure {
  title: string;
  description: string;
  pages: WikiPage[];
}

export interface WikiPage {
  slug: string;
  title: string;
  description: string;
  importance: 'high' | 'medium' | 'low';
  relevant_files: string[];
  related_pages: string[];
}

export interface GeneratedPage {
  slug: string;
  content: string;
}
