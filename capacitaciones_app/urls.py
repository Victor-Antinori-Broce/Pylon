from django.contrib import admin
from django.urls import path
from django.conf import settings
from django.conf.urls.static import static

from capacitaciones_app.views import (
    lista_cursos,
    detalle_curso,
    ver_tema,
    marcar_tema_completado,
    quiz_modulo,
    certificado,
    perfil_usuario,  # Nueva vista agregada
    validacion_ui,  # Vista de validación UI
    custom_logout,  # Vista personalizada de logout
)

from .views_asignacion import (
    asignacion_admin,
    asignar_curso_ajax,
    cursos_asignados_ajax,
    miembros_grupo_ajax,
    desasignar_curso_ajax,
    exportar_asignaciones_excel,
    historial_asignaciones_ajax,
    historial_usuario,
    historial_asignaciones_view,
    usuarios_disponibles_grupo,
    agregar_miembros_grupo,
    remover_miembro_grupo,
    usuario_cursos_asignados,
    cursos_disponibles,
)

from .views_dashboard import dashboard_view
from capacitaciones_app.views_encuesta import encuesta_satisfaccion_curso
from capacitaciones_app.api import encuestas_json, actualizar_progreso
from .views_perfiles import (
    gestionar_perfiles,
    editar_perfil,
    cambiar_rol_ajax,
    toggle_activo_ajax,
    crear_perfiles_faltantes,
    sincronizar_desde_pacifico,
    asignar_usuario_grupo_ajax,
    remover_usuario_grupo_ajax,
    crear_grupo_ajax,
    editar_grupo_ajax,
    editar_usuario_ajax,
)

urlpatterns = [
    # 🔐 Admin & Auth
    # path('nested_admin/', include('nested_admin.urls')),    
    
    # 🔐 Logout personalizado
    path('logout/', custom_logout, name='custom_logout'),
    
    # 📚 Courses
    path('cursos/', lista_cursos, name='lista_cursos'),
    path('cursos/<int:curso_id>/', detalle_curso, name='detalle_curso'),    
    
    # 👤 Perfil de Usuario
    path('perfil/', perfil_usuario, name='perfil_usuario'),
    
    # 🔍 Validación UI
    path('validacion-ui/', validacion_ui, name='validacion_ui'),
    
    # 📖 Topics
    path('cursos/<int:curso_id>/tema/<int:tema_id>/', ver_tema, name='ver_tema'),
    path('temas/<int:tema_id>/completado/', marcar_tema_completado, name='marcar_tema_completado'),
    
    # 📝 Quiz by module
    path('cursos/<int:curso_id>/modulo/<int:modulo_id>/quiz/', quiz_modulo, name='quiz_modulo'),    
    
    # 🎓 Certificate
    path('cursos/<int:curso_id>/certificado/', certificado, name='certificado'),
    
    # 👨‍💼 Admin Asignación
    path('capacitaciones/asignacion/', asignacion_admin, name='asignacion_admin'),
    
    # 📊 Dashboard
    path('capacitaciones/dashboard/', dashboard_view, name='dashboard'),
    
    # 📋 Historial de Asignaciones (Nueva vista independiente)
    path('capacitaciones/historial/', historial_asignaciones_view, name='historial_asignaciones'),
    
    # AJAX endpoints para asignación
    path('asignar-curso/', asignar_curso_ajax, name='asignar_curso_ajax'),
    path('cursos-asignados/<int:usuario_id>/', cursos_asignados_ajax, name='cursos_asignados_ajax'),
    path('miembros-grupo/<int:grupo_id>/', miembros_grupo_ajax, name='miembros_grupo_ajax'),
    path('usuarios-grupo/<int:grupo_id>/', miembros_grupo_ajax, name='usuarios_grupo_ajax'),  # Alias para compatibilidad
    path('desasignar-curso/', desasignar_curso_ajax, name='desasignar_curso_ajax'),
    
    # en algun punto quitar_usuario_grupo_ajax tuvo que haber existido, pero ya no se ve aca en las url
    # Gestión de grupos
    path('usuarios-disponibles-grupo/<int:grupo_id>/', usuarios_disponibles_grupo, name='usuarios_disponibles_grupo'),
    path('agregar-miembros-grupo/', agregar_miembros_grupo, name='agregar_miembros_grupo'),
    path('remover-miembro-grupo/', remover_miembro_grupo, name='remover_miembro_grupo'),
    path('quitar-usuario-grupo/', remover_miembro_grupo, name='quitar_usuario_grupo_ajax'),  # Alias para compatibilidad
    path('exportar-asignaciones-excel/', exportar_asignaciones_excel, name='exportar_asignaciones_excel'),
    path('capacitaciones/historial_asignaciones_ajax/', historial_asignaciones_ajax, name='historial_asignaciones_ajax'),
    path('mi-progreso/', historial_usuario, name='mi_progreso'),
    
    # Encuesta de Satisfacción
    path('encuesta/satisfaccion/', encuesta_satisfaccion_curso, name='encuesta_satisfaccion_curso'),
    
    # API Endpoints
    path('api/encuestas/', encuestas_json, name='encuestas_json'),
    path('api/actualizar_progreso/', actualizar_progreso, name='actualizar_progreso'),
    path('api/usuario/<int:usuario_id>/cursos/', usuario_cursos_asignados, name='usuario_cursos_asignados'),
    path('api/cursos/disponibles/', cursos_disponibles, name='cursos_disponibles'),
    
    # Gestión de Perfiles (Solo Administradores)
    path('capacitaciones/perfiles/', gestionar_perfiles, name='gestionar_perfiles'),
    path('capacitaciones/perfiles/<int:perfil_id>/editar/', editar_perfil, name='editar_perfil'),
    path('capacitaciones/perfiles/cambiar-rol/', cambiar_rol_ajax, name='cambiar_rol_ajax'),
    path('capacitaciones/perfiles/toggle-activo/', toggle_activo_ajax, name='toggle_activo_ajax'),
    path('capacitaciones/perfiles/crear-faltantes/', crear_perfiles_faltantes, name='crear_perfiles_faltantes'),
    path('capacitaciones/perfiles/sincronizar/', sincronizar_desde_pacifico, name='sincronizar_desde_pacifico'),
    path('capacitaciones/perfiles/asignar-grupo/', asignar_usuario_grupo_ajax, name='asignar_usuario_grupo_ajax'),
    path('capacitaciones/perfiles/remover-grupo/', remover_usuario_grupo_ajax, name='remover_usuario_grupo_ajax'),
    path('capacitaciones/perfiles/crear-grupo/', crear_grupo_ajax, name='crear_grupo_ajax'),
    path('capacitaciones/perfiles/editar-grupo/', editar_grupo_ajax, name='editar_grupo_ajax'),
    path('capacitaciones/perfiles/editar-usuario/', editar_usuario_ajax, name='editar_usuario_ajax'),
]

# Always serve media files (both debug and production)
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
