import React, { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

interface HeaderProps {
  title: string;
}

const Header: React.FC<HeaderProps> = ({ title }) => {
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur px-8 flex items-center justify-between select-none">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm font-medium">Platform</span>
        <span className="text-muted-foreground text-sm font-medium">/</span>
        <h1 className="text-sm font-bold text-foreground tracking-wide uppercase">{title}</h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Theme toggler */}
        <button
          onClick={toggleTheme}
          className="p-2.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-xl transition-all cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
};

export default Header;
