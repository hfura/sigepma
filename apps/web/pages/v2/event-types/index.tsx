import { UserPlan } from "@prisma/client";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { Fragment, useEffect, useState } from "react";

import { CAL_URL, WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { inferQueryOutput, trpc } from "@calcom/trpc/react";
import { Icon } from "@calcom/ui";
import { Badge, Button, ButtonGroup, Dialog, EmptyScreen, showToast, Switch, Tooltip } from "@calcom/ui/v2";
import ConfirmationDialogContent from "@calcom/ui/v2/core/ConfirmationDialogContent";
import Dropdown, {
  DropdownItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@calcom/ui/v2/core/Dropdown";
import Shell from "@calcom/ui/v2/core/Shell";
import CreateEventTypeButton from "@calcom/ui/v2/modules/event-types/CreateEventType";

import { withQuery } from "@lib/QueryCell";
import { HttpError } from "@lib/core/http/error";

import { EmbedButton, EmbedDialog } from "@components/Embed";
import EventTypeDescription from "@components/eventtype/EventTypeDescription";
import Avatar from "@components/ui/Avatar";
import AvatarGroup from "@components/ui/AvatarGroup";
import SkeletonLoader from "@components/v2/eventtype/SkeletonLoader";

import { TRPCClientError } from "@trpc/react";

type EventTypeGroups = inferQueryOutput<"viewer.eventTypes">["eventTypeGroups"];
type EventTypeGroupProfile = EventTypeGroups[number]["profile"];

interface EventTypeListHeadingProps {
  profile: EventTypeGroupProfile;
  membershipCount: number;
}

type EventTypeGroup = inferQueryOutput<"viewer.eventTypes">["eventTypeGroups"][number];
type EventType = EventTypeGroup["eventTypes"][number];
interface EventTypeListProps {
  group: EventTypeGroup;
  groupIndex: number;
  readOnly: boolean;
  types: EventType[];
}

const Item = ({ type, group, readOnly }: { type: EventType; group: EventTypeGroup; readOnly: boolean }) => {
  const { t } = useLocale();

  return (
    <Link href={`/event-types/${type.id}`}>
      <a
        className="flex-grow truncate text-sm"
        title={`${type.title} ${type.description ? `– ${type.description}` : ""}`}>
        <div>
          <span
            className="truncate font-semibold text-gray-700 ltr:mr-1 rtl:ml-1"
            data-testid={"event-type-title-" + type.id}>
            {type.title}
          </span>
          <small
            className="hidden font-normal leading-4 text-gray-600 sm:inline"
            data-testid={"event-type-slug-" + type.id}>{`/${group.profile.slug}/${type.slug}`}</small>
          {readOnly && (
            <span className="rtl:mr-2inline items-center rounded-sm bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-800 ltr:ml-2">
              {t("readonly") as string}
            </span>
          )}
        </div>
        <EventTypeDescription eventType={type} />
      </a>
    </Link>
  );
};

const MemoizedItem = React.memo(Item);

export const EventTypeList = ({ group, groupIndex, readOnly, types }: EventTypeListProps): JSX.Element => {
  const { t } = useLocale();
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogTypeId, setDeleteDialogTypeId] = useState(0);
  const utils = trpc.useContext();
  const mutation = trpc.useMutation("viewer.eventTypeOrder", {
    onError: async (err) => {
      console.error(err.message);
      await utils.cancelQuery(["viewer.eventTypes"]);
      await utils.invalidateQueries(["viewer.eventTypes"]);
    },
    onSettled: async () => {
      await utils.invalidateQueries(["viewer.eventTypes"]);
    },
  });

  const setHiddenMutation = trpc.useMutation("viewer.eventTypes.update", {
    onError: async (err) => {
      console.error(err.message);
      await utils.cancelQuery(["viewer.eventTypes"]);
      await utils.invalidateQueries(["viewer.eventTypes"]);
    },
    onSettled: async () => {
      await utils.invalidateQueries(["viewer.eventTypes"]);
    },
  });

  function moveEventType(index: number, increment: 1 | -1) {
    const newList = [...types];

    const type = types[index];
    const tmp = types[index + increment];
    if (tmp) {
      newList[index] = tmp;
      newList[index + increment] = type;
    }

    utils.cancelQuery(["viewer.eventTypes"]);
    utils.setQueryData(["viewer.eventTypes"], (data) => {
      // tRPC is very strict with the return signature...
      if (!data)
        return {
          eventTypeGroups: [],
          profiles: [],
          viewer: { canAddEvents: true, plan: UserPlan.PRO },
        };
      return {
        ...data,
        eventTypesGroups: [
          ...data.eventTypeGroups.slice(0, groupIndex),
          { ...group, eventTypes: newList },
          ...data.eventTypeGroups.slice(groupIndex + 1),
        ],
      };
    });

    mutation.mutate({
      ids: newList.map((type) => type.id),
    });
  }

  async function deleteEventTypeHandler(id: number) {
    const payload = { id };
    deleteMutation.mutate(payload);
  }

  // inject selection data into url for correct router history
  const openModal = (group: EventTypeGroup, type: EventType) => {
    const query = {
      ...router.query,
      dialog: "new-eventtype",
      eventPage: group.profile.slug,
      title: type.title,
      slug: type.slug,
      description: type.description,
      length: type.length,
      type: type.schedulingType,
      teamId: group.teamId,
    };
    if (!group.teamId) {
      delete query.teamId;
    }
    router.push(
      {
        pathname: router.pathname,
        query,
      },
      undefined,
      { shallow: true }
    );
  };

  const deleteMutation = trpc.useMutation("viewer.eventTypes.delete", {
    onSuccess: async () => {
      await utils.invalidateQueries(["viewer.eventTypes"]);
      showToast(t("event_type_deleted_successfully"), "success");
      setDeleteDialogOpen(false);
    },
    onError: (err) => {
      if (err instanceof HttpError) {
        const message = `${err.statusCode}: ${err.message}`;
        showToast(message, "error");
        setDeleteDialogOpen(false);
      } else if (err instanceof TRPCClientError) {
        showToast(err.message, "error");
      }
    },
  });

  const [isNativeShare, setNativeShare] = useState(true);

  useEffect(() => {
    if (!navigator.share) {
      setNativeShare(false);
    }
  }, []);

  const firstItem = types[0];
  const lastItem = types[types.length - 1];
  return (
    <div className="mb-16 flex overflow-hidden rounded-md border border-gray-200 bg-white">
      <ul className="w-full divide-y divide-neutral-200" data-testid="event-types">
        {types.map((type, index) => {
          const embedLink = `${group.profile.slug}/${type.slug}`;
          const calLink = `${CAL_URL}/${embedLink}`;
          return (
            <li key={type.id}>
              <div className="flex items-center justify-between hover:bg-neutral-50">
                <div className="group flex w-full items-center justify-between px-4 py-4 pr-0 sm:px-6">
                  {!(firstItem && firstItem.id === type.id) && (
                    <button
                      className="invisible absolute left-[5px] -mt-4 mb-4 -ml-4 hidden h-6 w-6 scale-0 items-center justify-center rounded-md border bg-white p-1 text-gray-400 transition-all hover:border-transparent hover:text-black hover:shadow disabled:hover:border-inherit disabled:hover:text-gray-400 disabled:hover:shadow-none group-hover:visible group-hover:scale-100 sm:ml-0 sm:flex lg:left-[36px]"
                      onClick={() => moveEventType(index, -1)}>
                      <Icon.FiArrowUp className="h-5 w-5" />
                    </button>
                  )}

                  {!(lastItem && lastItem.id === type.id) && (
                    <button
                      className="invisible absolute left-[5px] mt-8 -ml-4 hidden h-6 w-6 scale-0 items-center justify-center rounded-md  border bg-white p-1 text-gray-400 transition-all hover:border-transparent hover:text-black hover:shadow disabled:hover:border-inherit disabled:hover:text-gray-400 disabled:hover:shadow-none group-hover:visible group-hover:scale-100 sm:ml-0 sm:flex lg:left-[36px]"
                      onClick={() => moveEventType(index, 1)}>
                      <Icon.FiArrowDown className="h-5 w-5" />
                    </button>
                  )}
                  <MemoizedItem type={type} group={group} readOnly={readOnly} />
                  <div className="mt-4 hidden flex-shrink-0 sm:mt-0 sm:ml-5 sm:flex">
                    <div className="flex justify-between space-x-2 rtl:space-x-reverse">
                      {type.users?.length > 1 && (
                        <AvatarGroup
                          border="border-2 border-white"
                          className="relative top-1 right-3"
                          size={8}
                          truncateAfter={4}
                          items={type.users.map((organizer) => ({
                            alt: organizer.name || "",
                            image: `${WEBAPP_URL}/${organizer.username}/avatar.png`,
                            title: organizer.name || "",
                          }))}
                        />
                      )}
                      <div className="flex items-center justify-between space-x-2 rtl:space-x-reverse">
                        {type.hidden && (
                          <Badge variant="gray" size="lg">
                            {t("hidden")}
                          </Badge>
                        )}
                        <Tooltip content={t("show_eventtype_on_profile") as string}>
                          <div className="self-center rounded-md p-2 hover:bg-gray-200">
                            <Switch
                              name="Hidden"
                              checked={!type.hidden}
                              onCheckedChange={() => {
                                setHiddenMutation.mutate({ id: type.id, hidden: !type.hidden });
                              }}
                            />
                          </div>
                        </Tooltip>

                        <ButtonGroup combined>
                          <Tooltip content={t("preview") as string}>
                            <Button
                              color="secondary"
                              target="_blank"
                              size="icon"
                              href={calLink}
                              StartIcon={Icon.FiExternalLink}
                              combined
                            />
                          </Tooltip>

                          <Tooltip content={t("copy_link") as string}>
                            <Button
                              color="secondary"
                              size="icon"
                              StartIcon={Icon.FiLink}
                              onClick={() => {
                                showToast(t("link_copied"), "success");
                                navigator.clipboard.writeText(calLink);
                              }}
                              combined
                            />
                          </Tooltip>
                          <Dropdown>
                            <DropdownMenuTrigger asChild data-testid={"event-type-options-" + type.id}>
                              <Button
                                type="button"
                                size="icon"
                                color="secondary"
                                combined
                                StartIcon={Icon.FiMoreHorizontal}
                              />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem>
                                <DropdownItem
                                  type="button"
                                  href={"/event-types/" + type.id}
                                  StartIcon={Icon.FiEdit2}>
                                  {t("edit") as string}
                                </DropdownItem>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="outline-none">
                                <DropdownItem
                                  type="button"
                                  data-testid={"event-type-duplicate-" + type.id}
                                  StartIcon={Icon.FiCopy}
                                  onClick={() => openModal(group, type)}>
                                  {t("duplicate") as string}
                                </DropdownItem>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="outline-none">
                                <EmbedButton
                                  as={DropdownItem}
                                  type="button"
                                  StartIcon={Icon.FiCode}
                                  className="w-full rounded-none"
                                  embedUrl={encodeURIComponent(embedLink)}>
                                  {t("embed")}
                                </EmbedButton>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator className="h-px bg-gray-200" />
                              {/* readonly is only set when we are on a team - if we are on a user event type null will be the value. */}
                              {(group.metadata?.readOnly === false || group.metadata.readOnly === null) && (
                                <DropdownMenuItem>
                                  <DropdownItem
                                    onClick={() => {
                                      setDeleteDialogOpen(true);
                                      setDeleteDialogTypeId(type.id);
                                    }}
                                    StartIcon={Icon.FiTrash}
                                    className="w-full rounded-none">
                                    {t("delete") as string}
                                  </DropdownItem>
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </Dropdown>
                        </ButtonGroup>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mr-5 flex flex-shrink-0 sm:hidden">
                  <Dropdown>
                    <DropdownMenuTrigger asChild data-testid={"event-type-options-" + type.id}>
                      <Button type="button" size="icon" color="secondary" StartIcon={Icon.FiMoreHorizontal} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent portalled>
                      <DropdownMenuItem className="outline-none">
                        <Link href={calLink}>
                          <a target="_blank">
                            <Button
                              color="minimal"
                              StartIcon={Icon.FiExternalLink}
                              className="w-full rounded-none">
                              {t("preview") as string}
                            </Button>
                          </a>
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="outline-none">
                        <Button
                          type="button"
                          color="minimal"
                          className="w-full rounded-none text-left"
                          data-testid={"event-type-duplicate-" + type.id}
                          StartIcon={Icon.FiClipboard}
                          onClick={() => {
                            navigator.clipboard.writeText(calLink);
                            showToast(t("link_copied"), "success");
                          }}>
                          {t("copy_link") as string}
                        </Button>
                      </DropdownMenuItem>
                      {isNativeShare ? (
                        <DropdownMenuItem className="outline-none">
                          <Button
                            type="button"
                            color="minimal"
                            className="w-full rounded-none"
                            data-testid={"event-type-duplicate-" + type.id}
                            StartIcon={Icon.FiUpload}
                            onClick={() => {
                              navigator
                                .share({
                                  title: t("share"),
                                  text: t("share_event"),
                                  url: calLink,
                                })
                                .then(() => showToast(t("link_shared"), "success"))
                                .catch(() => showToast(t("failed"), "error"));
                            }}>
                            {t("share") as string}
                          </Button>
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem className="outline-none">
                        <Button
                          type="button"
                          href={"/event-types/" + type.id}
                          color="minimal"
                          className="w-full"
                          StartIcon={Icon.FiEdit}>
                          {t("edit") as string}
                        </Button>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="outline-none">
                        <Button
                          type="button"
                          color="minimal"
                          className="w-full rounded-none"
                          data-testid={"event-type-duplicate-" + type.id}
                          StartIcon={Icon.FiCopy}
                          onClick={() => openModal(group, type)}>
                          {t("duplicate") as string}
                        </Button>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="h-px bg-gray-200" />
                      <DropdownMenuItem className="outline-none">
                        <Button
                          onClick={() => {
                            setDeleteDialogOpen(true);
                            setDeleteDialogTypeId(type.id);
                          }}
                          color="destructive"
                          StartIcon={Icon.FiTrash}
                          className="w-full rounded-none">
                          {t("delete") as string}
                        </Button>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </Dropdown>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <ConfirmationDialogContent
          isLoading={deleteMutation.isLoading}
          variety="danger"
          title={t("delete_event_type")}
          confirmBtnText={t("confirm_delete_event_type")}
          loadingText={t("confirm_delete_event_type")}
          onConfirm={(e) => {
            e.preventDefault();
            deleteEventTypeHandler(deleteDialogTypeId);
          }}>
          {t("delete_event_type_description") as string}
        </ConfirmationDialogContent>
      </Dialog>
    </div>
  );
};

const EventTypeListHeading = ({ profile, membershipCount }: EventTypeListHeadingProps): JSX.Element => {
  return (
    <div className="mb-4 flex">
      <Link href="/settings/teams">
        <a>
          <Avatar
            alt={profile?.name || ""}
            imageSrc={`${WEBAPP_URL}/${profile.slug}/avatar.png` || undefined}
            size={8}
            className="mt-1 inline ltr:mr-2 rtl:ml-2"
          />
        </a>
      </Link>
      <div>
        <Link href="/settings/teams">
          <a className="font-bold">{profile?.name || ""}</a>
        </Link>
        {membershipCount && (
          <span className="relative -top-px text-xs text-neutral-500 ltr:ml-2 rtl:mr-2">
            <Link href="/settings/teams">
              <a>
                <Badge variant="gray">
                  <Icon.FiUsers className="mr-1 -mt-px inline h-3 w-3" />
                  {membershipCount}
                </Badge>
              </a>
            </Link>
          </span>
        )}
        {profile?.slug && (
          <Link href={`${CAL_URL}/${profile.slug}`}>
            <a className="block text-xs text-neutral-500">{`${CAL_URL?.replace("https://", "")}/${
              profile.slug
            }`}</a>
          </Link>
        )}
      </div>
    </div>
  );
};

const CreateFirstEventTypeView = () => {
  const { t } = useLocale();

  return (
    <EmptyScreen
      Icon={Icon.FiLink}
      headline={t("new_event_type_heading")}
      description={t("new_event_type_description")}
    />
  );
};

const CTA = () => {
  const query = trpc.useQuery(["viewer.eventTypes"]);

  if (!query.data) return null;

  return <CreateEventTypeButton canAddEvents={true} options={query.data.profiles} />;
};

const WithQuery = withQuery(["viewer.eventTypes"]);

const EventTypesPage = () => {
  const { t } = useLocale();
  return (
    <div>
      <Head>
        <title>Home | Cal.com</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <Shell
        heading={t("event_types_page_title") as string}
        subtitle={t("event_types_page_subtitle") as string}
        CTA={<CTA />}>
        <WithQuery
          customLoader={<SkeletonLoader />}
          success={({ data }) => (
            <>
              {data.eventTypeGroups.map((group, index) => (
                <Fragment key={group.profile.slug}>
                  {/* hide list heading when there is only one (current user) */}
                  {(data.eventTypeGroups.length !== 1 || group.teamId) && (
                    <EventTypeListHeading
                      profile={group.profile}
                      membershipCount={group.metadata.membershipCount}
                    />
                  )}
                  <EventTypeList
                    types={group.eventTypes}
                    group={group}
                    groupIndex={index}
                    readOnly={group.metadata.readOnly}
                  />
                </Fragment>
              ))}

              {data.eventTypeGroups.length === 0 && <CreateFirstEventTypeView />}
              <EmbedDialog />
            </>
          )}
        />
      </Shell>
    </div>
  );
};

export default EventTypesPage;
