import { useQuery } from "@tanstack/react-query";
import { releaseQuery } from "../../lib/query/contentQueries";

/**
 * The name with a private tell: when the content came from the API, the
 * initial of each word is coloured (red, then blue); on bundled fallback
 * content the name stays as styled. Nothing else changes, so only someone who
 * knows looks twice.
 */
export function SourceMarkedName({ name }: { name: string }) {
  const source = useQuery({ ...releaseQuery, select: (content) => content.source }).data;
  if (source !== "api") return <>{name}</>;
  const colours = ["#ff5c5c", "#4da3ff"];
  return (
    <>
      {name.split(" ").map((word, index) => (
        <span key={`${word}-${index}`}>
          {index > 0 ? " " : null}
          <span style={{ color: colours[index % colours.length] }}>{word.slice(0, 1)}</span>
          {word.slice(1)}
        </span>
      ))}
    </>
  );
}
