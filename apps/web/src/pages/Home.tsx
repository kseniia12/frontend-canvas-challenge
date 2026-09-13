import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { boot, createSpace, lastSpaceId, useCanvas } from '../store';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Notice } from '../ui/Notice';

export function HomePage() {
  const navigate = useNavigate();
  const { spaces, notice, ready } = useCanvas();
  const [title, setTitle] = useState('Мой канвас');
  const last = lastSpaceId();

  useEffect(() => {
    void boot();
  }, []);

  return (
    <section className="page">
      <h1>Пространства</h1>
      <Notice notice={notice} />
      {!ready ? <p className="muted">Загружаем список…</p> : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void createSpace(title).then((space) => {
            if (space) navigate(`/s/${space.id}`);
          });
        }}
      >
        <Field label="Название" name="title" value={title} onChange={setTitle} />
        <Button type="submit">Создать пространство</Button>
      </form>
      {last ? (
        <p>
          <Link to={`/s/${last}`}>Открыть последнее пространство</Link>
        </p>
      ) : null}
      <ul className="space-list">
        {spaces.map((space) => (
          <li key={space.id}>
            <Link to={`/s/${space.id}`}>{space.title}</Link>
            <span className="muted">{new Date(space.createdAt).toLocaleString('ru')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
