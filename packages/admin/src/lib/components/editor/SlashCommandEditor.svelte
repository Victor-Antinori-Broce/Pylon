<script lang="ts">
  import { t } from "$lib/i18n";
  /**
   * SlashCommandEditor.svelte
   * A lightweight rich-text editor with slash commands
   * Built on top of a native textarea for simplicity
   */
  import {
    Heading,
    List,
    ListOrdered,
    Image,
    Quote,
    Code,
    Bold,
    Italic,
    Link,
    CheckSquare,
    Minus,
  } from "lucide-svelte";

  interface Props {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    /**
     * Quien escribe ha pedido una imagen.
     *
     * El editor NO abre la biblioteca por su cuenta: no sabe de dónde salen los
     * medios y no debería. Avisa, el contenedor enseña el selector y luego le
     * devuelve la elegida por `insertarImagen`.
     *
     * Si no se pasa, el botón no aparece — un botón que no lleva a ninguna
     * parte es peor que no tenerlo.
     */
    onPedirImagen?: () => void;
    /**
     * Han llegado ficheros pegándolos o arrastrándolos.
     *
     * Mismo reparto que `onPedirImagen`: el editor detecta el gesto y avisa;
     * subirlos es de quien tiene la biblioteca. Sin esto el editor tendría que
     * conocer la API de medios, que es justo lo que se evitó al principio.
     */
    onSubirFicheros?: (ficheros: File[]) => void;
  }

  const {
    value = "",
    onChange,
    onSubirFicheros,
    placeholder = t("slashCommandEditor.typeForCommands"),
    onPedirImagen,
  }: Props = $props();

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
    {
      id: "heading1",
      label: t("slashCommandEditor.heading1"),
      icon: Heading,
      shortcut: "# ",
      description: t("slashCommandEditor.largeSectionHeading"),
    },
    {
      id: "heading2",
      label: t("slashCommandEditor.heading2"),
      icon: Heading,
      shortcut: "## ",
      description: t("slashCommandEditor.mediumSectionHeading"),
    },
    {
      id: "heading3",
      label: t("slashCommandEditor.heading3"),
      icon: Heading,
      shortcut: "### ",
      description: t("slashCommandEditor.smallSectionHeading"),
    },
    {
      id: "bullet",
      label: t("slashCommandEditor.bulletList"),
      icon: List,
      shortcut: "- ",
      description: t("slashCommandEditor.createABulletList"),
    },
    {
      id: "numbered",
      label: t("slashCommandEditor.numberedList"),
      icon: ListOrdered,
      shortcut: "1. ",
      description: t("slashCommandEditor.createANumberedList"),
    },
    {
      id: "todo",
      label: t("slashCommandEditor.toDoList"),
      icon: CheckSquare,
      shortcut: "- [ ] ",
      description: t("slashCommandEditor.createAToDoList"),
    },
    {
      id: "quote",
      label: t("slashCommandEditor.quote"),
      icon: Quote,
      shortcut: "> ",
      description: t("slashCommandEditor.createABlockquote"),
    },
    {
      id: "code",
      label: t("slashCommandEditor.codeBlock"),
      icon: Code,
      shortcut: "```\n\n```",
      description: t("slashCommandEditor.insertACodeBlock"),
    },
    {
      id: "divider",
      label: t("slashCommandEditor.divider"),
      icon: Minus,
      shortcut: "---\n",
      description: t("slashCommandEditor.insertAHorizontalDivider"),
    },
    {
      id: "image",
      label: t("slashCommandEditor.image"),
      icon: Image,
      shortcut: "![alt](url)",
      description: t("slashCommandEditor.insertAnImage"),
    },
  ];

  const filteredCommands = $derived(
    commands.filter(
      (cmd) =>
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
        left: rect.left + 16,
      };
    } else {
      showSlashMenu = false;
    }
  }

  function executeCommand(command: (typeof commands)[0]) {
    /**
     * `/image` abre la biblioteca; no escribe `![alt](url)`.
     *
     * Ese texto no es insertar una imagen: es dejar deberes. Hay que ir a otra
     * pantalla, encontrar el fichero, copiar su URL y volver a pegarla — con
     * una biblioteca de medios cargada en esta misma pantalla.
     */
    if (command.id === "image" && onPedirImagen) {
      // El hueco que abrió el menú (`/imagen`) se borra antes: si no, quedaría
      // escrito en medio del texto junto a la imagen.
      const hasta = textarea.selectionStart;
      const desde = localValue.lastIndexOf("/", hasta - 1);
      if (desde >= 0) {
        localValue = localValue.slice(0, desde) + localValue.slice(hasta);
        onChange?.(localValue);
        posicionGuardada = desde;
      } else {
        posicionGuardada = hasta;
      }
      showSlashMenu = false;
      onPedirImagen();
      return;
    }

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
        selectedCommandIndex =
          (selectedCommandIndex - 1 + filteredCommands.length) % filteredCommands.length;
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

  /**
   * Dónde estaba el cursor cuando se pidió la imagen.
   *
   * Abrir el modal quita el foco del textarea. `selectionStart` sobrevive al
   * blur en los navegadores actuales, pero apoyarse en eso es frágil: basta con
   * que el modal enfoque su primer elemento para que la imagen acabe al
   * principio del texto en vez de donde se estaba escribiendo. Se guarda.
   */
  let posicionGuardada = 0;

  /** Resalta el área mientras se arrastra encima. Sin señal, nadie suelta. */
  let arrastrando = $state(false);

  /**
   * Anota dónde está el cursor AHORA.
   *
   * Se exporta porque el botón de «Imagen» que de verdad usa la gente no vive
   * aquí: está en la cabecera del editor del blog, para que salga también en
   * modo Markdown. Ese botón abre el modal sin pasar por `pedirImagen()`, así
   * que sin esto la posición guardada se quedaba en 0 y la imagen entraba al
   * PRINCIPIO del artículo — exactamente el fallo que describe el comentario
   * de `posicionGuardada`, provocado por el camino que nadie había recorrido.
   */
  export function recordarPosicion() {
    posicionGuardada = textarea?.selectionStart ?? localValue.length;
  }

  function pedirImagen() {
    recordarPosicion();
    showSlashMenu = false;
    onPedirImagen?.();
  }

  /**
   * La llama el contenedor cuando ya hay una imagen elegida.
   *
   * Se exporta a propósito: es la única forma de que quien es dueño de la
   * biblioteca de medios escriba en la posición del cursor de este editor sin
   * que este componente tenga que conocer la biblioteca.
   */
  export function insertarImagen(url: string, alt = "") {
    const markdown = `![${alt}](${url})`;
    const pos = Math.min(posicionGuardada, localValue.length);

    localValue = localValue.slice(0, pos) + markdown + localValue.slice(pos);
    onChange?.(localValue);

    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(pos + markdown.length, pos + markdown.length);
    });
  }

  /**
   * Las imágenes de un portapapeles o de un arrastre.
   *
   * `DataTransfer` mezcla texto, HTML y ficheros: una captura de pantalla llega
   * como fichero, pero copiar una imagen de una web trae ADEMÁS su `<img>` en
   * HTML. Filtrar por `type` deja solo lo que de verdad hay que subir.
   */
  function imagenesDe(datos: DataTransfer | null): File[] {
    if (!datos) return [];
    return Array.from(datos.files).filter((f) => f.type.startsWith("image/"));
  }

  function alPegar(event: ClipboardEvent) {
    const imagenes = imagenesDe(event.clipboardData);
    if (imagenes.length === 0) return; // texto normal: que lo pegue el navegador

    // Solo se corta el pegado por defecto cuando HAY imagen. Cortarlo siempre
    // rompería pegar texto, que es lo que se hace el 99% de las veces.
    event.preventDefault();
    recordarPosicion();
    onSubirFicheros?.(imagenes);
  }

  function alSoltar(event: DragEvent) {
    const imagenes = imagenesDe(event.dataTransfer);
    if (imagenes.length === 0) return;

    event.preventDefault();
    arrastrando = false;

    // El cursor NO está donde se soltó: soltar no mueve el punto de inserción.
    // Se usa la última posición conocida, que es donde la persona estaba
    // escribiendo — más predecible que el final del texto.
    onSubirFicheros?.(imagenes);
  }

  /**
   * `dragover` hay que cancelarlo o el navegador ABRE el fichero, sacando de la
   * página el artículo a medio escribir. Es el fallo clásico del arrastrar y
   * soltar, y no avisa.
   */
  function alArrastrarEncima(event: DragEvent) {
    if (!onSubirFicheros) return;
    event.preventDefault();
    arrastrando = true;
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
  <div
    class="flex items-center gap-1 p-1.5 rounded-lg border border-kitsuden-border bg-kitsuden-card"
  >
    <button
      type="button"
      onclick={() => wrapSelection("**", "**")}
      class="p-1.5 rounded hover:bg-kitsuden-border/50 text-kitsuden-text-dim hover:text-kitsuden-text transition-colors"
      title={t("slashCommandEditor.boldCtrlB")}
    >
      <Bold class="w-4 h-4" />
    </button>
    <button
      type="button"
      onclick={() => wrapSelection("*", "*")}
      class="p-1.5 rounded hover:bg-kitsuden-border/50 text-kitsuden-text-dim hover:text-kitsuden-text transition-colors"
      title={t("slashCommandEditor.italicCtrlI")}
    >
      <Italic class="w-4 h-4" />
    </button>
    <button
      type="button"
      onclick={() => wrapSelection("[", "](url)")}
      class="p-1.5 rounded hover:bg-kitsuden-border/50 text-kitsuden-text-dim hover:text-kitsuden-text transition-colors"
      title={t("slashCommandEditor.linkCtrlK")}
    >
      <Link class="w-4 h-4" />
    </button>

    <div class="w-px h-5 bg-kitsuden-border mx-1"></div>

    <button
      type="button"
      onclick={() => insertAtCursor("# ")}
      class="p-1.5 rounded hover:bg-kitsuden-border/50 text-kitsuden-text-dim hover:text-kitsuden-text transition-colors"
      title={t("slashCommandEditor.heading1")}
    >
      <Heading class="w-4 h-4" />
    </button>
    <button
      type="button"
      onclick={() => insertAtCursor("- ")}
      class="p-1.5 rounded hover:bg-kitsuden-border/50 text-kitsuden-text-dim hover:text-kitsuden-text transition-colors"
      title={t("slashCommandEditor.bulletList")}
    >
      <List class="w-4 h-4" />
    </button>
    <button
      type="button"
      onclick={() => insertAtCursor("> ")}
      class="p-1.5 rounded hover:bg-kitsuden-border/50 text-kitsuden-text-dim hover:text-kitsuden-text transition-colors"
      title={t("slashCommandEditor.quote")}
    >
      <Quote class="w-4 h-4" />
    </button>
    {#if onPedirImagen}
      <button
        type="button"
        onclick={pedirImagen}
        class="p-1.5 rounded hover:bg-kitsuden-border/50 text-kitsuden-text-dim hover:text-kitsuden-text transition-colors"
        title={t("slashCommandEditor.insertarImagenDeLaBiblioteca")}
      >
        <Image class="w-4 h-4" />
      </button>
    {/if}
    <button
      type="button"
      onclick={() => insertAtCursor("```\n\n```")}
      class="p-1.5 rounded hover:bg-kitsuden-border/50 text-kitsuden-text-dim hover:text-kitsuden-text transition-colors"
      title={t("slashCommandEditor.codeBlock")}
    >
      <Code class="w-4 h-4" />
    </button>

    <div class="flex-1"></div>

    <span class="text-[10px] text-kitsuden-subtle px-2">{t("slashCommandEditor.typeForCommands2")}</span>
  </div>

  <!-- Editor -->
  <div class="relative">
    <textarea
      bind:this={textarea}
      value={localValue}
      oninput={handleInput}
      onkeydown={handleKeyDown}
      onpaste={alPegar}
      ondrop={alSoltar}
      ondragover={alArrastrarEncima}
      ondragleave={() => (arrastrando = false)}
      {placeholder}
      class="w-full min-h-[300px] p-4 rounded-xl border bg-kitsuden-card text-kitsuden-text placeholder:text-kitsuden-subtle resize-y focus:outline-none focus:ring-2 focus:ring-kitsuden-accent/20 focus:border-kitsuden-accent/50 font-mono text-sm leading-relaxed {arrastrando
        ? 'border-kitsuden-accent border-dashed'
        : 'border-kitsuden-border'}"
      spellcheck="false"
    ></textarea>

    <!-- Slash Command Menu -->
    {#if showSlashMenu && filteredCommands.length > 0}
      <div
        class="fixed z-50 w-64 rounded-xl border border-kitsuden-border bg-kitsuden-card shadow-2xl overflow-hidden"
        style="top: {slashMenuPosition.top}px; left: {slashMenuPosition.left}px;"
      >
        <div
          class="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-kitsuden-subtle border-b border-kitsuden-border"
        >
          {t("slashCommandEditor.basicBlocks")}
        </div>
        <div class="max-h-64 overflow-y-auto py-1">
          {#each filteredCommands as cmd, i}
            {@const Icon = cmd.icon}
            <button
              type="button"
              class="w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors {i ===
              selectedCommandIndex
                ? 'bg-kitsuden-accent/10 text-kitsuden-accent'
                : 'text-kitsuden-text hover:bg-kitsuden-border/30'}"
              onclick={() => executeCommand(cmd)}
              onmouseenter={() => (selectedCommandIndex = i)}
            >
              <div
                class="w-8 h-8 rounded-lg border border-kitsuden-border flex items-center justify-center shrink-0 {i ===
                selectedCommandIndex
                  ? 'border-kitsuden-accent/30 bg-kitsuden-accent/5'
                  : 'bg-kitsuden-bg'}"
              >
                <Icon class="w-4 h-4" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate">{cmd.label}</p>
                <p class="text-xs text-kitsuden-subtle truncate">{cmd.description}</p>
              </div>
            </button>
          {/each}
        </div>
        <div
          class="px-3 py-2 border-t border-kitsuden-border bg-kitsuden-bg/50 text-[10px] text-kitsuden-subtle"
        >
          {t("slashCommandEditor.toNavigateEnterToSelect")}
        </div>
      </div>
    {/if}
  </div>
</div>
