<script lang="ts">
  /**
   * SlashCommandEditor.svelte
   * A lightweight rich-text editor with slash commands
   * Built on top of a native textarea for simplicity
   */
  import { Heading, List, ListOrdered, Image, Quote, Code, Bold, Italic, Link, CheckSquare, Minus } from "lucide-svelte";
  
  interface Props {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }
  
  const { value = "", onChange, placeholder = "Type '/' for commands..." }: Props = $props();
  
  let textarea: HTMLTextAreaElement;
  let localValue = $state(value);
  let showSlashMenu = $state(false);
  let slashQuery = $state("");
  let slashMenuPosition = $state({ top: 0, left: 0 });
  let selectedCommandIndex = $state(0);
  
  // Sync external value
  $effect(() => {
    if (value !== localValue) {
      localValue = value;
    }
  });
  
  const commands = [
    { id: "heading1", label: "Heading 1", icon: Heading, shortcut: "# ", description: "Large section heading" },
    { id: "heading2", label: "Heading 2", icon: Heading, shortcut: "## ", description: "Medium section heading" },
    { id: "heading3", label: "Heading 3", icon: Heading, shortcut: "### ", description: "Small section heading" },
    { id: "bullet", label: "Bullet List", icon: List, shortcut: "- ", description: "Create a bullet list" },
    { id: "numbered", label: "Numbered List", icon: ListOrdered, shortcut: "1. ", description: "Create a numbered list" },
    { id: "todo", label: "To-do List", icon: CheckSquare, shortcut: "- [ ] ", description: "Create a to-do list" },
    { id: "quote", label: "Quote", icon: Quote, shortcut: "> ", description: "Create a blockquote" },
    { id: "code", label: "Code Block", icon: Code, shortcut: "```\n\n```", description: "Insert a code block" },
    { id: "divider", label: "Divider", icon: Minus, shortcut: "---\n", description: "Insert a horizontal divider" },
    { id: "image", label: "Image", icon: Image, shortcut: "![alt](url)", description: "Insert an image" },
  ];
  
  const filteredCommands = $derived(
    commands.filter(cmd => 
      cmd.label.toLowerCase().includes(slashQuery.toLowerCase()) ||
      cmd.id.toLowerCase().includes(slashQuery.toLowerCase())
    )
  );
  
  function handleInput(e: Event) {
    localValue = (e.target as HTMLTextAreaElement).value;
    onChange?.(localValue);
    checkSlashCommand();
  }
  
  function checkSlashCommand() {
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = localValue.slice(0, cursorPosition);
    const lines = textBeforeCursor.split("\n");
    const currentLine = lines[lines.length - 1];
    
    const slashMatch = currentLine.match(/^\/(.*)$/);
    
    if (slashMatch) {
      slashQuery = slashMatch[1];
      showSlashMenu = true;
      selectedCommandIndex = 0;
      
      // Calculate position
      const rect = textarea.getBoundingClientRect();
      const lineHeight = 24;
      const linesAbove = lines.length;
      slashMenuPosition = {
        top: rect.top + linesAbove * lineHeight - textarea.scrollTop + 8,
        left: rect.left + 16
      };
    } else {
      showSlashMenu = false;
    }
  }
  
  function executeCommand(command: typeof commands[0]) {
    const cursorPosition = textarea.selectionStart;
    const textBeforeCursor = localValue.slice(0, cursorPosition);
    const lines = textBeforeCursor.split("\n");
    const currentLineStart = textBeforeCursor.lastIndexOf("\n") + 1;
    
    const beforeCommand = localValue.slice(0, currentLineStart);
    const afterCommand = localValue.slice(cursorPosition);
    
    const insertion = command.shortcut;
    let newCursorPos = beforeCommand.length + insertion.length;
    
    // For code block, place cursor in the middle
    if (command.id === "code") {
      newCursorPos = beforeCommand.length + insertion.indexOf("\n") + 1;
    }
    
    localValue = beforeCommand + insertion + afterCommand;
    onChange?.(localValue);
    showSlashMenu = false;
    
    // Focus and set cursor
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }
  
  function handleKeyDown(e: KeyboardEvent) {
    if (!showSlashMenu) {
      // Toolbar shortcuts
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey) {
        switch (e.key) {
          case "b":
            e.preventDefault();
            wrapSelection("**", "**");
            break;
          case "i":
            e.preventDefault();
            wrapSelection("*", "*");
            break;
          case "k":
            e.preventDefault();
            wrapSelection("[", "](url)");
            break;
        }
      }
      return;
    }
    
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        selectedCommandIndex = (selectedCommandIndex + 1) % filteredCommands.length;
        break;
      case "ArrowUp":
        e.preventDefault();
        selectedCommandIndex = (selectedCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
        break;
      case "Enter":
        e.preventDefault();
        if (filteredCommands[selectedCommandIndex]) {
          executeCommand(filteredCommands[selectedCommandIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        showSlashMenu = false;
        break;
    }
  }
  
  function wrapSelection(before: string, after: string) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = localValue.slice(start, end);
    
    localValue = localValue.slice(0, start) + before + selectedText + after + localValue.slice(end);
    onChange?.(localValue);
    
    requestAnimationFrame(() => {
      textarea.focus();
      const newCursorPos = start + before.length + selectedText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    });
  }
  
  function insertAtCursor(text: string) {
    const start = textarea.selectionStart;
    localValue = localValue.slice(0, start) + text + localValue.slice(start);
    onChange?.(localValue);
    
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    });
  }
</script>

<div class="relative flex flex-col gap-2">
  <!-- Toolbar -->
  <div class="flex items-center gap-1 p-1.5 rounded-lg border border-gremius-border bg-gremius-card">
    <button 
      type="button"
      onclick={() => wrapSelection("**", "**")}
      class="p-1.5 rounded hover:bg-gremius-border/50 text-gremius-text-dim hover:text-gremius-text transition-colors"
      title="Bold (Ctrl+B)"
    >
      <Bold class="w-4 h-4" />
    </button>
    <button 
      type="button"
      onclick={() => wrapSelection("*", "*")}
      class="p-1.5 rounded hover:bg-gremius-border/50 text-gremius-text-dim hover:text-gremius-text transition-colors"
      title="Italic (Ctrl+I)"
    >
      <Italic class="w-4 h-4" />
    </button>
    <button 
      type="button"
      onclick={() => wrapSelection("[", "](url)")}
      class="p-1.5 rounded hover:bg-gremius-border/50 text-gremius-text-dim hover:text-gremius-text transition-colors"
      title="Link (Ctrl+K)"
    >
      <Link class="w-4 h-4" />
    </button>
    
    <div class="w-px h-5 bg-gremius-border mx-1"></div>
    
    <button 
      type="button"
      onclick={() => insertAtCursor("# ")}
      class="p-1.5 rounded hover:bg-gremius-border/50 text-gremius-text-dim hover:text-gremius-text transition-colors"
      title="Heading 1"
    >
      <Heading class="w-4 h-4" />
    </button>
    <button 
      type="button"
      onclick={() => insertAtCursor("- ")}
      class="p-1.5 rounded hover:bg-gremius-border/50 text-gremius-text-dim hover:text-gremius-text transition-colors"
      title="Bullet List"
    >
      <List class="w-4 h-4" />
    </button>
    <button 
      type="button"
      onclick={() => insertAtCursor("> ")}
      class="p-1.5 rounded hover:bg-gremius-border/50 text-gremius-text-dim hover:text-gremius-text transition-colors"
      title="Quote"
    >
      <Quote class="w-4 h-4" />
    </button>
    <button 
      type="button"
      onclick={() => insertAtCursor("```\n\n```")}
      class="p-1.5 rounded hover:bg-gremius-border/50 text-gremius-text-dim hover:text-gremius-text transition-colors"
      title="Code Block"
    >
      <Code class="w-4 h-4" />
    </button>
    
    <div class="flex-1"></div>
    
    <span class="text-[10px] text-gremius-subtle px-2">Type "/" for commands</span>
  </div>
  
  <!-- Editor -->
  <div class="relative">
    <textarea
      bind:this={textarea}
      value={localValue}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      {placeholder}
      class="w-full min-h-[300px] p-4 rounded-xl border border-gremius-border bg-gremius-card text-gremius-text placeholder:text-gremius-subtle resize-y focus:outline-none focus:ring-2 focus:ring-gremius-cyan/20 focus:border-gremius-cyan/50 font-mono text-sm leading-relaxed"
      spellcheck="false"
    ></textarea>
    
    <!-- Slash Command Menu -->
    {#if showSlashMenu && filteredCommands.length > 0}
      <div 
        class="fixed z-50 w-64 rounded-xl border border-gremius-border bg-gremius-card shadow-2xl overflow-hidden"
        style="top: {slashMenuPosition.top}px; left: {slashMenuPosition.left}px;"
      >
        <div class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gremius-subtle border-b border-gremius-border">
          Basic Blocks
        </div>
        <div class="max-h-64 overflow-y-auto py-1">
          {#each filteredCommands as cmd, i}
            {@const Icon = cmd.icon}
            <button
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors {i === selectedCommandIndex ? 'bg-gremius-cyan/10 text-gremius-cyan' : 'text-gremius-text hover:bg-gremius-border/30'}"
              onclick={() => executeCommand(cmd)}
              onmouseenter={() => selectedCommandIndex = i}
            >
              <div class="w-8 h-8 rounded-lg border border-gremius-border flex items-center justify-center shrink-0 {i === selectedCommandIndex ? 'border-gremius-cyan/30 bg-gremius-cyan/5' : 'bg-gremius-bg'}">
                <Icon class="w-4 h-4" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate">{cmd.label}</p>
                <p class="text-xs text-gremius-subtle truncate">{cmd.description}</p>
              </div>
            </button>
          {/each}
        </div>
        <div class="px-3 py-2 border-t border-gremius-border bg-gremius-bg/50 text-[10px] text-gremius-subtle">
          ↑↓ to navigate · Enter to select · Esc to close
        </div>
      </div>
    {/if}
  </div>
</div>
