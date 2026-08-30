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
import MobileTabBar from '../components/MobileTabBar';

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

      {/* /my-notes renders OUTSIDE the AppShell layout (see AppRoutes), so the
          mobile tab bar has to be mounted here too — otherwise tapping "Notes"
          lands on a page with no primary nav, which reads as a dead end. The
          real fix is moving this route inside AppShell and deleting this page's
          private nav entirely; that is finding F6 in the UI/UX report. */}
      {isMobile && (
        <>
          <div aria-hidden style={{ height: 78 }} />
          <MobileTabBar />
        </>
      )}

      {showFoundersModal && (
        <Suspense fallback={<LoadingSpinner />}>
          <FoundersModal onClose={() => setShowFoundersModal(false)} />
        </Suspense>
      )}
    </div>
  );
}
