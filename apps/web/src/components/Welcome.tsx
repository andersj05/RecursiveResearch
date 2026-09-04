import type { Project } from '@recursive-research/contracts';
import { Icon } from './Icon';

export function Welcome({
  projects,
  onCreate,
  onSelect,
}: {
  projects: Project[];
  onCreate: () => void;
  onSelect: (project: Project) => void;
}) {
  return (
    <div className="welcome page-content">
      <div className="welcome-heading">
        <span className="welcome-monogram" aria-hidden="true">
          RR
        </span>
        <h1>RecursiveResearch</h1>
      </div>
      <section className="welcome-projects" aria-labelledby="projects-heading">
        <div className="section-title-row">
          <h2 id="projects-heading">Projects</h2>
          {projects.length > 0 && (
            <button type="button" className="button primary small" onClick={onCreate}>
              <Icon name="plus" size={14} />
              New project
            </button>
          )}
        </div>
        {projects.length ? (
          <ul className="home-project-list">
            {[...projects]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .map((project) => (
                <li key={project.id}>
                  <button type="button" onClick={() => onSelect(project)}>
                    <Icon name="folder" size={21} />
                    <span className="home-project-copy">
                      <strong>{project.name}</strong>
                      <span title={project.folderPath}>{project.folderPath}</span>
                    </span>
                    {!project.available && <span className="tag">Folder unavailable</span>}
                    <Icon name="arrow" size={16} />
                  </button>
                </li>
              ))}
          </ul>
        ) : (
          <button className="welcome-create" type="button" onClick={onCreate}>
            <Icon name="folder" size={26} />
            <strong>Create a project</strong>
            <span>Choose a folder to get started.</span>
          </button>
        )}
      </section>
    </div>
  );
}
