import Link from "next/link";

interface ClubNavProps {
  clubSlug: string;
}

export function ClubNav({ clubSlug }: ClubNavProps) {
  const tabs = [
    { label: "클럽 홈", href: `/c/${clubSlug}` },
    { label: "멤버 관리", href: `/c/${clubSlug}/members` },
    { label: "대회", href: `/c/${clubSlug}/tournaments` },
    { label: "랭킹", href: `/c/${clubSlug}/ranking` },
  ];

  return (
    <nav className="w-full flex gap-1 border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-t-md transition-colors"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
