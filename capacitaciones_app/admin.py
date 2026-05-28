from django.contrib import admin
from django.utils.html import format_html
import nested_admin

from django.contrib import messages
from django.utils import timezone

from .models import (
    Curso,
    Modulo,
    Tema,
    ArchivoAdicional,
    ProgresoCurso,
    ProgresoTema,
    Quiz,
    Pregunta,
    Opcion,
    ResultadoQuiz,
    GrupoAsignacion,
    PerfilUsuario,
)
from .models_encuesta import EncuestaSatisfaccionCurso

# 🔹 Opciones dentro de una pregunta
class OpcionInline(nested_admin.NestedTabularInline):
    model = Opcion
    extra = 2

# 🔹 Preguntas dentro de un quiz
class PreguntaInline(nested_admin.NestedStackedInline):
    model = Pregunta
    extra = 1
    fields = ['texto', 'puntaje', 'archivo']
    inlines = [OpcionInline]

# 🔹 Quiz dentro del módulo
class QuizInline(nested_admin.NestedStackedInline):
    model = Quiz
    extra = 0
    inlines = [PreguntaInline]
    fieldsets = (
        (None, {'fields': ('titulo', 'instrucciones', 'portada')}),
    )

# 🔹 Archivos adicionales por tema
class ArchivoAdicionalInline(nested_admin.NestedTabularInline):
    model = ArchivoAdicional
    extra = 1

# 🔹 Temas dentro de un módulo
class TemaInline(nested_admin.NestedStackedInline):
    model = Tema
    extra = 1
    inlines = [ArchivoAdicionalInline]
    fields = (
        'orden',
        'titulo',
        'contenido',
        'video_local',
        'video_youtube',
        'video_externo',
        'imagen',
        'documento',
    )

# 🔹 Módulos dentro del curso
class ModuloInline(nested_admin.NestedStackedInline):
    model = Modulo
    extra = 1
    inlines = [TemaInline, QuizInline]
    fieldsets = (
        (None, {'fields': ('orden', 'titulo')}),
    )

# 🔹 Cursos completos
class CursoAdmin(nested_admin.NestedModelAdmin):
    list_display = ('titulo', 'tipo_curso', 'fecha_inicio', 'fecha_fin', 'duracion_horas')
    inlines = [ModuloInline]
    search_fields = ('titulo',)
    list_filter = ('tipo_curso', 'fecha_inicio',)
    filter_horizontal = ('usuarios_asignados', 'grupos_asignados')  # ✅ Si quieres ver grupos también
    fields = ('titulo', 'descripcion', 'tipo_curso', 'fecha_inicio', 'fecha_fin', 'duracion_horas', 'portada', 'color_portada', 'usuarios_asignados', 'grupos_asignados')

# 🔹 Grupos de asignación (corregido)
@admin.register(GrupoAsignacion)
class GrupoAsignacionAdmin(admin.ModelAdmin):
    list_display = ('nombre', 'supervisor_principal', 'get_supervisores_count', 'get_usuarios_count')
    search_fields = ('nombre', 'supervisor_principal__username', 'supervisor_principal__first_name', 'supervisor_principal__last_name')
    list_filter = ('supervisor_principal',)
    filter_horizontal = ('usuarios_asignados', 'supervisores_adicionales')  # ✅ CORREGIDO: sin cursos
    
    def get_usuarios_count(self, obj):
        return obj.usuarios_asignados.count()
    get_usuarios_count.short_description = 'Usuarios'
    
    def get_supervisores_count(self, obj):
        return len(obj.todos_supervisores)
    get_supervisores_count.short_description = 'Total Supervisores'

# 🔹 Temas individuales
class TemaAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'modulo', 'orden', 'preview_video_youtube')
    list_filter = ('modulo',)
    search_fields = ('titulo',)
    fields = (
        'modulo',
        'orden',
        'titulo',
        'contenido',
        'video_local',
        'video_youtube',
        'video_externo',
        'imagen',
        'documento',
    )

    def preview_video_youtube(self, obj):
        if obj.video_youtube:
            return format_html(f"<a href='{obj.video_youtube}' target='_blank'>🔗 Ver</a>")
        return "—"
    preview_video_youtube.short_description = "YouTube"

# 🔹 Resultados del quiz
class ResultadoQuizAdmin(admin.ModelAdmin):
    list_display = ('usuario', 'quiz', 'puntaje', 'aprobado', 'fecha_realizacion')
    list_filter = ('aprobado',)
    search_fields = ('usuario__username',)

# 🔹 Encuestas de satisfacción del curso
class EncuestaSatisfaccionCursoAdmin(admin.ModelAdmin):
    list_display = ('departamento', 'cargo', 'expositor', 'utilidad', 'satisfaccion', 'lugar', 'rol', 'usuario', 'fecha')
    list_filter = ('departamento', 'cargo', 'lugar', 'rol', 'fecha')
    search_fields = ('departamento', 'cargo', 'aprendido', 'recomendacion', 'usuario__username')
    readonly_fields = ('fecha',)

# 🔹 Progreso del curso
class ProgresoCursoAdmin(admin.ModelAdmin):
    list_display = ('usuario', 'curso', 'completado', 'encuesta_completada', 'fecha_completado')
    list_filter = ('completado', 'encuesta_completada')
    search_fields = ('usuario__username', 'curso__titulo')

# 🔹 Perfil de Usuario (Capacitaciones)
@admin.register(PerfilUsuario)
class PerfilUsuarioAdmin(admin.ModelAdmin):
    list_display = ('get_username', 'get_full_name', 'rol_capacitaciones', 'activo', 'fecha_asignacion_rol')
    list_filter = ('rol_capacitaciones', 'activo', 'fecha_asignacion_rol')
    search_fields = ('user__username', 'user__first_name', 'user__last_name', 'user__email', 'notas')
    readonly_fields = ('fecha_asignacion_rol',)
    list_editable = ('rol_capacitaciones', 'activo')
    
    fieldsets = (
        ('Usuario', {
            'fields': ('user',)
        }),
        ('Rol y Permisos', {
            'fields': ('rol_capacitaciones', 'activo', 'fecha_asignacion_rol')
        }),
        ('Notas Administrativas', {
            'fields': ('notas',),
            'classes': ('collapse',)
        }),
    )
    
    def get_username(self, obj):
        return obj.user.username
    get_username.short_description = 'Usuario'
    get_username.admin_order_field = 'user__username'
    
    def get_full_name(self, obj):
        full_name = f"{obj.user.first_name} {obj.user.last_name}".strip()
        return full_name if full_name else '—'
    get_full_name.short_description = 'Nombre Completo'
    get_full_name.admin_order_field = 'user__first_name'
    
    # Acciones en masa
    actions = ['asignar_rol_administrador', 'asignar_rol_supervisor', 'asignar_rol_estudiante', 'sync_from_pacifico']
    
    def asignar_rol_administrador(self, request, queryset):
        updated = queryset.update(
            rol_capacitaciones='administrador',
            fecha_asignacion_rol=timezone.now()
        )
        self.message_user(
            request,
            f'{updated} perfil(es) actualizado(s) a Administrador.',
            messages.SUCCESS
        )
    asignar_rol_administrador.short_description = 'Asignar rol: Administrador'
    
    def asignar_rol_supervisor(self, request, queryset):
        updated = queryset.update(
            rol_capacitaciones='supervisor',
            fecha_asignacion_rol=timezone.now()
        )
        self.message_user(
            request,
            f'{updated} perfil(es) actualizado(s) a Supervisor.',
            messages.SUCCESS
        )
    asignar_rol_supervisor.short_description = 'Asignar rol: Supervisor'
    
    def asignar_rol_estudiante(self, request, queryset):
        updated = queryset.update(
            rol_capacitaciones='estudiante',
            fecha_asignacion_rol=timezone.now()
        )
        self.message_user(
            request,
            f'{updated} perfil(es) actualizado(s) a Estudiante.',
            messages.SUCCESS
        )
    asignar_rol_estudiante.short_description = 'Asignar rol: Estudiante'
    
    def sync_from_pacifico(self, request, queryset):
        """Sincronizar roles desde pacifico.UserProfile"""
        role_mapping = {
            'Administrador': 'administrador',
            'Supervisor': 'supervisor',
            'Oficial': 'estudiante',
            'Asistente': 'estudiante',
            'Analista': 'estudiante',
            'Back Office': 'estudiante',
            'Usuario': 'estudiante',
        }
        
        updated = 0
        for perfil in queryset:
            try:
                if hasattr(perfil.user, 'userprofile'):
                    pacifico_rol = perfil.user.userprofile.rol
                    nuevo_rol = role_mapping.get(pacifico_rol, 'estudiante')
                    
                    if perfil.rol_capacitaciones != nuevo_rol:
                        perfil.rol_capacitaciones = nuevo_rol
                        perfil.fecha_asignacion_rol = timezone.now()
                        perfil.notas = f"Sincronizado desde pacifico ({pacifico_rol}) - {timezone.now().strftime('%Y-%m-%d %H:%M')}"
                        perfil.save()
                        updated += 1
            except Exception as e:
                self.message_user(
                    request,
                    f'Error sincronizando {perfil.user.username}: {str(e)}',
                    messages.ERROR
                )
        
        self.message_user(
            request,
            f'{updated} perfil(es) sincronizado(s) desde pacifico.',
            messages.SUCCESS
        )
    sync_from_pacifico.short_description = 'Sincronizar roles desde pacifico'


# 🔹 Registro final
admin.site.register(Curso, CursoAdmin)
admin.site.register(Modulo)
admin.site.register(Tema, TemaAdmin)
admin.site.register(ArchivoAdicional)
admin.site.register(ProgresoCurso, ProgresoCursoAdmin)
admin.site.register(ProgresoTema)
admin.site.register(Quiz)
admin.site.register(ResultadoQuiz, ResultadoQuizAdmin)
admin.site.register(EncuestaSatisfaccionCurso, EncuestaSatisfaccionCursoAdmin)
