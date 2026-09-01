import type { ReactNode } from "react";

interface ProductPageHeaderProps {
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly kicker: ReactNode;
  readonly title: ReactNode;
  readonly titleId?: string;
}

export function ProductPageHeader({
  actions,
  className,
  description,
  icon,
  kicker,
  title,
  titleId,
}: ProductPageHeaderProps) {
  return (
    <header
      className={[
        "product-page-header",
        icon ? "product-page-header--with-icon" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {icon ? <span className="product-page-icon">{icon}</span> : null}
      <div className="product-page-heading">
        <span className="product-page-kicker">{kicker}</span>
        <h1 id={titleId}>{title}</h1>
        {description ? (
          <p className="product-page-description">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="product-page-actions">{actions}</div> : null}
    </header>
  );
}

export function ProductEmptyState({
  action,
  body,
  icon,
  title,
}: {
  readonly action?: ReactNode;
  readonly body: ReactNode;
  readonly icon?: ReactNode;
  readonly title: ReactNode;
}) {
  return (
    <div className="product-empty-state" role="status">
      {icon ? <span className="product-empty-icon">{icon}</span> : null}
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ProductSectionHeader({
  count,
  description,
  kicker,
  title,
  titleId,
}: {
  readonly count?: ReactNode;
  readonly description?: ReactNode;
  readonly kicker?: ReactNode;
  readonly title: ReactNode;
  readonly titleId?: string;
}) {
  return (
    <header className="product-section-header">
      <div>
        {kicker ? <span>{kicker}</span> : null}
        <h2 id={titleId}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {count ? <small>{count}</small> : null}
    </header>
  );
}
