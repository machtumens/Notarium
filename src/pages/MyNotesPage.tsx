import { lazy, Suspense } from 'react';
import { darkTheme } from '../theme';
import LoadingSpinner from '../components/LoadingSpinner';
import ProfileEditor from '../components/ProfileEditor';
import UploadNoteModal from '../components/UploadNoteModal';
import { useMyNotes } from './my-notes/useMyNotes';
import MyNotesNav from './my-notes/MyNotesNav';
import MobileMenu from './my-notes/MobileMenu';
import NotesContent from './my-notes/NotesContent';
import EditNoteModal from './my-notes/EditNoteModal';
import MyNotesFooter from './my-notes/MyNotesFooter';

const FoundersModal = lazy(() => import('../components/FoundersModal'));

export default function MyNotesPage() {
  const {
    notes,
    subjects,
    loading,
    activeTab,
    setActiveTab,
    showUploadModal,
    setShowUploadModal,
    editingNote,
    setEditingNote,
    editTitle,
    setEditTitle,
    editContent,
    setEditContent,
    editTags,
    setEditTags,
    saving,
    showProfileEditor,
    setShowProfileEditor,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    isMobile,
    showFoundersModal,
    setShowFoundersModal,
    closeMobileMenu,
    handleUploadSuccess,
    handlePublishNote,
    handleEdit,
    handleSave,
    handleDelete,
    notesBySubject,
  } = useMyNotes();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: darkTheme.colors.bgPrimary,
        color: darkTheme.colors.textPrimary,
      }}
    >
      <MyNotesNav
        isMobile={isMobile}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        setShowProfileEditor={setShowProfileEditor}
      />

      {isMobileMenuOpen && <MobileMenu isMobile={isMobile} closeMobileMenu={closeMobileMenu} />}

      <NotesContent
        loading={loading}
        isMobile={isMobile}
        notes={notes}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        setShowUploadModal={setShowUploadModal}
        notesBySubject={notesBySubject}
        saving={saving}
        handlePublishNote={handlePublishNote}
        handleEdit={handleEdit}
        handleDelete={handleDelete}
      />

      {editingNote && (
        <EditNoteModal
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          editContent={editContent}
          setEditContent={setEditContent}
          editTags={editTags}
          setEditTags={setEditTags}
          saving={saving}
          onClose={() => setEditingNote(null)}
          onSave={handleSave}
        />
      )}

      {showUploadModal && (
        <UploadNoteModal
          onClose={() => setShowUploadModal(false)}
          subjects={subjects}
          onSuccess={handleUploadSuccess}
        />
      )}

      {showProfileEditor && <ProfileEditor onClose={() => setShowProfileEditor(false)} />}

      <MyNotesFooter isMobile={isMobile} setShowFoundersModal={setShowFoundersModal} />

      {showFoundersModal && (
        <Suspense fallback={<LoadingSpinner />}>
          <FoundersModal onClose={() => setShowFoundersModal(false)} />
        </Suspense>
      )}
    </div>
  );
}
