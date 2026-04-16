import { useState, useEffect } from "react";
import { useI18n } from "./i18n";
import { useAuth } from "./AuthContext";
import { API } from "./api";
import "./PublicProfilePage.css";

function SocialLink({ url, label, icon }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="pub-social-link">
      <span className="pub-social-icon">{icon}</span>
      <span>{label}</span>
    </a>
  );
}

function FavSection({ title, items, type }) {
  if (!items?.length) return null;
  return (
    <div className="pub-fav-section">
      <h4 className="pub-fav-section-title">{title}</h4>
      <div className="pub-fav-list">
        {items.map(item => {
          const name = item.name || item.title || item.editionName || "—";
          const img  = item.imageUrl || item.coverUrl || null;
          return (
            <div key={item.id} className="pub-fav-chip">
              {img && <img src={img} alt={name} className="pub-fav-chip-img" />}
              <span>{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PublicProfilePage({ username, onBack }) {
  const { t }        = useI18n();
  const { user }     = useAuth();

  const [profile, setProfile]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);
  const [following, setFollowing]     = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setNotFound(false);

    const profileFetch = fetch(API.USER_PROFILE(username))
      .then(r => {
        if (r.status === 404) { setNotFound(true); return null; }
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(data => { if (data) setProfile(data); })
      .catch(() => setNotFound(true));

    const statusFetch = fetch(API.FOLLOW_STATUS(username), { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setFollowing(data.following ?? false);
          setFollowerCount(data.followerCount ?? 0);
          setFollowingCount(data.followingCount ?? 0);
        }
      })
      .catch(() => {});

    Promise.all([profileFetch, statusFetch]).finally(() => setLoading(false));
  }, [username]);

  const handleFollow = async () => {
    if (!user) return;
    setFollowLoading(true);
    try {
      const method = following ? "DELETE" : "POST";
      const r = await fetch(API.FOLLOW(username), { method, credentials: "include" });
      if (r.ok) {
        setFollowing(!following);
        setFollowerCount(c => following ? c - 1 : c + 1);
      }
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) return <div className="pub-loading">⏳</div>;
  if (notFound || !profile) return <div className="pub-not-found">User not found.</div>;

  const isSelf   = user?.username === username;
  const hasSocial = profile.goodreadsUrl || profile.storygraphUrl || profile.instagramUrl || profile.twitterUrl;
  const favs      = profile.favorites || {};
  const hasFavs   = (
    favs.books?.length || favs.editions?.length || favs.authors?.length ||
    favs.artists?.length || favs.companies?.length
  );

  return (
    <div className="pub-page">
      {onBack && (
        <button className="pub-back-btn" onClick={onBack}>{t("back")}</button>
      )}
      <div className="pub-card">

        <div className="pub-hero">
          {profile.avatarUrl
            ? <img src={profile.avatarUrl} alt={profile.username} className="pub-avatar" />
            : <div className="pub-avatar-placeholder">{(profile.username || "?")[0].toUpperCase()}</div>
          }
          <div className="pub-hero-info">
            <h1 className="pub-username">@{profile.username}</h1>
            {profile.firstName && (
              <p className="pub-fullname">{profile.firstName} {profile.lastName || ""}</p>
            )}
            <div className="pub-counts">
              <span className="pub-count-chip">
                <strong>{followerCount}</strong> {t("follow.followers")}
              </span>
              <span className="pub-count-chip">
                <strong>{followingCount}</strong> {t("follow.following")}
              </span>
            </div>
          </div>
          {user && !isSelf && (
            <button
              className={`pub-follow-btn${following ? " following" : ""}`}
              onClick={handleFollow}
              disabled={followLoading}
            >
              {following ? t("follow.unfollow") : t("follow.follow")}
            </button>
          )}
        </div>

        {profile.bioPublic && (
          <section className="pub-section">
            <h3 className="pub-section-title">{t("publicProfile.bio")}</h3>
            <p className="pub-bio">{profile.bioPublic}</p>
          </section>
        )}

        {hasSocial && (
          <section className="pub-section">
            <h3 className="pub-section-title">{t("publicProfile.links")}</h3>
            <div className="pub-social-links">
              <SocialLink url={profile.goodreadsUrl}  label={t("publicProfile.goodreads")}  icon="📚" />
              <SocialLink url={profile.storygraphUrl} label={t("publicProfile.storygraph")} icon="📊" />
              <SocialLink url={profile.instagramUrl}  label={t("publicProfile.instagram")}  icon="📸" />
              <SocialLink url={profile.twitterUrl}    label={t("publicProfile.twitter")}    icon="🐦" />
            </div>
          </section>
        )}

        <section className="pub-section">
          <h3 className="pub-section-title">{t("publicProfile.favorites")}</h3>
          {!hasFavs ? (
            <p className="pub-empty">{t("favorites.emptyAll")}</p>
          ) : (
            <div className="pub-favs">
              <FavSection title={t("favorites.tabBooks")}     items={favs.books}     type="book" />
              <FavSection title={t("favorites.tabEditions")}  items={favs.editions}  type="edition" />
              <FavSection title={t("favorites.tabAuthors")}   items={favs.authors}   type="author" />
              <FavSection title={t("favorites.tabArtists")}   items={favs.artists}   type="artist" />
              <FavSection title={t("favorites.tabCompanies")} items={favs.companies} type="company" />
            </div>
          )}
        </section>

      </div>
    </div>
  );
}

