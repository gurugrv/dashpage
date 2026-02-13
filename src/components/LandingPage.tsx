'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Sparkles, Zap, Code2, Palette, Globe, Layers, Wand2, History, MessageSquare, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface Template {
  id: string;
  title: string;
  description: string;
  prompt: string;
  icon: React.ReactNode;
  gradient: string;
  category: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'coffee-shop',
    title: 'Coffee Shop Landing Page',
    description: 'A warm, inviting page with menu highlights and location info',
    prompt: 'Create a beautiful landing page for a specialty coffee shop called "Bean & Brew". Include a hero section with a warm photo placeholder, featured drinks with prices, customer testimonials, store hours, and a cozy color scheme with browns and creams.',
    icon: <Globe className="size-5" />,
    gradient: 'from-amber-500 to-orange-600',
    category: 'Business',
  },
  {
    id: 'portfolio',
    title: 'Portfolio Website',
    description: 'A clean, modern portfolio to showcase your work',
    prompt: 'Create a modern portfolio website for a freelance designer. Include a hero section with a bold introduction, a project gallery grid with image placeholders, an about section, skills list, and a contact form. Use a minimal black and white design with one accent color.',
    icon: <Layers className="size-5" />,
    gradient: 'from-cyan-500 to-blue-600',
    category: 'Personal',
  },
  {
    id: 'saas-pricing',
    title: 'SaaS Pricing Page',
    description: 'A conversion-focused pricing page with plan comparison',
    prompt: 'Create a SaaS pricing page with three tiers: Starter ($9/mo), Pro ($29/mo), and Enterprise (custom). Include feature comparison, a highlighted recommended plan, FAQ accordion section, and a clean professional design with blue tones.',
    icon: <Code2 className="size-5" />,
    gradient: 'from-violet-500 to-purple-600',
    category: 'SaaS',
  },
  {
    id: 'restaurant-menu',
    title: 'Restaurant Menu',
    description: 'An elegant digital menu with categories and prices',
    prompt: 'Create an elegant restaurant menu page for an Italian restaurant called "La Bella Cucina". Include sections for appetizers, pasta, main courses, desserts, and drinks. Each item should have a name, description, and price. Use a sophisticated dark background with gold accents.',
    icon: <Palette className="size-5" />,
    gradient: 'from-orange-500 to-rose-600',
    category: 'Food',
  },
  {
    id: 'event-invitation',
    title: 'Event Invitation',
    description: 'A beautiful invitation page for a special occasion',
    prompt: 'Create a wedding invitation webpage for "Sarah & James". Include the date (June 15, 2025), venue details with a map placeholder, event schedule, RSVP form, dress code info, and a romantic floral design with soft pink and sage green colors.',
    icon: <Wand2 className="size-5" />,
    gradient: 'from-pink-500 to-fuchsia-600',
    category: 'Events',
  },
  {
    id: 'blog',
    title: 'Blog Homepage',
    description: 'A content-rich blog layout with featured articles',
    prompt: 'Create a blog homepage for a tech blog called "Digital Frontiers". Include a featured post hero section, a grid of recent article cards with image placeholders, categories sidebar, newsletter signup form, and a modern design with dark mode aesthetics.',
    icon: <Zap className="size-5" />,
    gradient: 'from-emerald-500 to-teal-600',
    category: 'Content',
  },
];

const FEATURED_PROMPTS = [
  "Build a modern SaaS landing page with pricing and testimonials",
  "Create a portfolio website with dark mode and animations",
  "Design an e-commerce product page with cart",
  "Make a blog homepage with featured posts",
];

export function LandingPage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showConversations, setShowConversations] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);

  // Fetch conversations on mount
  useEffect(() => {
    const fetchConversations = async () => {
      setIsLoadingConversations(true);
      try {
        const response = await fetch('/api/conversations');
        if (response.ok) {
          const data = await response.json();
          setConversations(data.conversations || []);
        }
      } catch (error) {
        console.error('Failed to fetch conversations:', error);
      } finally {
        setIsLoadingConversations(false);
      }
    };
    fetchConversations();
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    
    setIsAnimating(true);
    // Navigate to builder with the prompt
    const encodedPrompt = encodeURIComponent(prompt.trim());
    router.push(`/builder?prompt=${encodedPrompt}`);
  }, [prompt, router]);

  const handleTemplateSelect = useCallback((template: Template) => {
    setPrompt(template.prompt);
  }, []);

  const handleQuickPrompt = useCallback((quickPrompt: string) => {
    setPrompt(quickPrompt);
  }, []);

  const handleSelectConversation = useCallback((conversationId: string) => {
    router.push(`/builder?conversation=${conversationId}`);
  }, [router]);

  const handleNewProject = useCallback(() => {
    router.push('/builder');
  }, [router]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-violet-500/10 via-transparent to-transparent rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-cyan-500/10 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-gradient-to-br from-fuchsia-500/5 to-transparent rounded-full blur-3xl" />
        
        {/* Grid pattern overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      {/* Conversations Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-80 bg-background/95 backdrop-blur-xl border-r border-border transform transition-transform duration-300 ease-in-out",
        showConversations ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <History className="size-5 text-muted-foreground" />
              <h2 className="font-semibold">Recent Projects</h2>
            </div>
            <button
              onClick={() => setShowConversations(false)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
          
          <div className="p-3">
            <button
              onClick={handleNewProject}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 text-white font-medium text-sm hover:from-violet-600 hover:to-purple-700 transition-all shadow-lg shadow-violet-500/25"
            >
              <Plus className="size-4" />
              New Project
            </button>
          </div>

          <ScrollArea className="flex-1 px-3">
            {isLoadingConversations ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex gap-1">
                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="size-2 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="size-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">No projects yet</p>
                <p className="text-xs text-muted-foreground/70 mt-1">Start building to see your projects here</p>
              </div>
            ) : (
              <div className="space-y-1 pb-4">
                {conversations.map((conversation) => (
                  <button
                    key={conversation.id}
                    onClick={() => handleSelectConversation(conversation.id)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left group"
                  >
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/10 to-purple-600/10">
                      <MessageSquare className="size-4 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate group-hover:text-violet-500 transition-colors">
                        {conversation.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(conversation.updatedAt)}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Overlay when sidebar is open */}
      {showConversations && (
        <div 
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={() => setShowConversations(false)}
        />
      )}

      {/* Main content */}
      <div className="relative z-10 flex flex-col min-h-screen">
        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 md:px-12">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowConversations(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            >
              <History className="size-4" />
              <span className="text-sm hidden sm:inline">Projects</span>
            </button>
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <Sparkles className="size-4 text-white" />
              </div>
              <span className="text-lg font-semibold tracking-tight">AI Builder</span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">Features</a>
            <a href="#" className="hover:text-foreground transition-colors">Examples</a>
            <a href="#" className="hover:text-foreground transition-colors">Docs</a>
          </nav>
        </header>

        {/* Hero section */}
        <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 md:py-20">
          <div className="max-w-4xl w-full space-y-8 text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/5 border border-primary/10 text-xs font-medium text-primary">
              <Sparkles className="size-3" />
              <span>Powered by AI</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
                Turn your ideas into
              </span>
              <br />
              <span className="bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 bg-clip-text text-transparent">
                stunning websites
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Describe what you want to build and watch AI create it in seconds. 
              No coding required — just your imagination.
            </p>

            {/* Main input */}
            <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-violet-500/20 via-fuchsia-500/20 to-cyan-500/20 rounded-2xl blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative flex items-center bg-background border border-border rounded-xl shadow-lg shadow-black/5 overflow-hidden focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10 transition-all">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the website you want to build..."
                    className="flex-1 px-5 py-4 bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none resize-none min-h-[56px] max-h-32"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!prompt.trim() || isAnimating}
                    className={cn(
                      "flex items-center gap-2 px-5 py-3 m-2 rounded-lg font-medium text-sm transition-all",
                      prompt.trim()
                        ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-lg shadow-violet-500/25"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    )}
                  >
                    <span className="hidden sm:inline">Generate</span>
                    <ArrowRight className="size-4" />
                  </button>
                </div>
              </div>
            </form>

            {/* Quick prompts */}
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">Try:</span>
              {FEATURED_PROMPTS.map((quickPrompt, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickPrompt(quickPrompt)}
                  className="px-3 py-1.5 rounded-full bg-muted/50 border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-all"
                >
                  {quickPrompt}
                </button>
              ))}
            </div>
          </div>

          {/* Templates section */}
          <div className="w-full max-w-6xl mx-auto mt-16 md:mt-24 px-4">
            <div className="text-center mb-8">
              <h2 className="text-2xl md:text-3xl font-semibold mb-2">
                What would you like to build?
              </h2>
              <p className="text-muted-foreground">
                Choose an example or type your own prompt above
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateSelect(template)}
                  className="group relative text-left p-5 rounded-xl border border-border bg-card hover:bg-accent/50 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {/* Gradient accent */}
                  <div className={cn(
                    "absolute top-0 left-0 right-0 h-1 rounded-t-xl bg-gradient-to-r opacity-0 group-hover:opacity-100 transition-opacity",
                    template.gradient
                  )} />
                  
                  <div className="flex items-start gap-4">
                    <div className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white",
                      template.gradient
                    )}>
                      {template.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold">{template.title}</h3>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {template.category}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {template.description}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="px-6 py-6 md:px-12 border-t border-border">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>© 2024 AI Builder. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
              <a href="#" className="hover:text-foreground transition-colors">Contact</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
